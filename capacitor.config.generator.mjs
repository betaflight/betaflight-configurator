import fs from 'fs';
import inquirer from 'inquirer';
import os from 'os';

const VITE_SERVER_PORT = 8000;

async function getIpList() {
  const nets = os.networkInterfaces();

  const ipList = [];
  for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
          const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
          if (net.family === familyV4Value && !net.internal) {
            ipList.push(net.address);
          }
      }
  }
  return ipList;
}

async function filterIpList(ipList) {

  if (ipList.length === 0) {
    console.log('No IP address found');
    process.exit(1);
  }

  if (ipList.length === 1) {
    console.log('Only one IP address found:', ipList[0]);
    return ipList[0];
  }

  const option = await inquirer.prompt([
    {
      type: 'list',
      name: 'ip',
      message: 'Select the IP address where the Vite server is running:',
      choices: ipList,
    },
  ]);

  return option.ip;
}

async function modifyDevCapacitorConfig(capacitorConfigBase) {
  const ipList = await getIpList();
  const ip = await filterIpList(ipList);

  capacitorConfigBase.server= {
    url: `http://${ip}:${VITE_SERVER_PORT}`,
    cleartext: true,
  };

  return capacitorConfigBase;
}

const capacitorConfig = JSON.parse(fs.readFileSync('./capacitor.config.base.json', { encoding: 'utf8', flag: 'r' }));

if (process.argv.length > 2 && process.argv[2] === '--dev') {
  modifyDevCapacitorConfig(capacitorConfig)
  .then((capacitorConfig) => {
    console.log('Generating capacitor.config.json DEVELOPMENT with:\n', capacitorConfig);
    fs.writeFileSync('capacitor.config.json', JSON.stringify(capacitorConfig));
  });
} else {
  console.log('Generating capacitor.config.json STANDARD with:\n', capacitorConfig);
  fs.writeFileSync('capacitor.config.json', JSON.stringify(capacitorConfig));
}

