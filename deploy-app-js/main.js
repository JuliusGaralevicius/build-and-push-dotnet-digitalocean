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
    const doToken = core.getInput('do_token');
    const appSpecVars = JSON.parse(core.getInput('app_spec_vars'));

    console.log(appSpecVars);

    // Install doctl and authenticate
    await exec.exec('sudo snap install doctl');
    await exec.exec(`doctl auth init -t ${doToken}`);

    for (const [key, value] of Object.entries(appSpecVars)) {
        process.env[key] = value;
      }
  
    // Render app spec
    const { stdout: renderedAppSpec } = await execPromisified(`envsubst < ${appspecPath}`);
    fs.writeFileSync(`${appspecPath}-updated`, renderedAppSpec);


    // Build container image
    const imageName = `${registry}/${appName}:${tag}`;
    const imageNameLatest = `${registry}/${appName}:latest`;
    await exec.exec(`docker build -f ${dockerfilePath} -t ${imageName} .`);
    await exec.exec(`docker tag ${imageName} ${imageNameLatest}`);

    // 3. Log in to DigitalOcean Container Registry with short-lived credentials
    await exec.exec(`doctl registry login --expiry-seconds 60`);

    // 4. Push image to DigitalOcean Container Registry
    await exec.exec(`docker push ${imageName}`);
    await exec.exec(`docker push ${imageNameLatest}`);

    // Prepare environment variables


    // Update App Platform app
    await exec.exec(`doctl apps create --spec ${appspecPath}-updated --upsert true`);

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();