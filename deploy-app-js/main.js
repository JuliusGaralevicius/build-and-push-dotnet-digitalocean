const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const util = require('util');
const execPromisified = util.promisify(require('child_process').exec);

async function run() {
  try {
    const appName = core.getInput('app_name');
    const dockerfilePath = core.getInput('dockerfile_path');
    const appspecPath = core.getInput('appspec_path');
    const tag = core.getInput('tag');
    const registry = core.getInput('registry');
    const appSpecVars = JSON.parse(core.getInput('app_spec_vars'));

    for (const [key, value] of Object.entries(appSpecVars)) {
        process.env[key] = value;
      }
  
    // Render app spec
    const { stdout: renderedAppSpec } = await execPromisified(`envsubst < ${appspecPath}`);
    fs.writeFileSync(`${appspecPath}-updated`, renderedAppSpec);

    console.log('---app spec:', renderedAppSpec);

    // Build container image
    const imageName = `${registry}/${appName}:${tag}`;
    const imageNameLatest = `${registry}/${appName}:latest`;
    await exec.exec(`docker build -f ${dockerfilePath} -t ${imageName} .`);
    await exec.exec(`docker tag ${imageName} ${imageNameLatest}`);


    console.log('---- will push the following images:', imageName, imageNameLatest)
    // Log in to DigitalOcean Container Registry with short-lived credentials
    await exec.exec(`doctl registry login --expiry-seconds 420`);

    // Push image to DigitalOcean Container Registry
    await exec.exec(`docker push ${imageName}`);
    await exec.exec(`docker push ${imageNameLatest}`);

    // Update App Platform app
    await exec.exec(`doctl apps create --spec ${appspecPath}-updated --upsert true`);

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();