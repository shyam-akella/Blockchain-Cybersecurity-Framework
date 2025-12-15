// scripts/genKeys.js
const fs = require('fs');
const forge = require('node-forge');

function gen() {
  console.log('Generating 2048-bit RSA keypair (this may take a few seconds)...');
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 });
  const pubPem = forge.pki.publicKeyToPem(keys.publicKey);
  const privPem = forge.pki.privateKeyToPem(keys.privateKey);

  if (!fs.existsSync('./keys')) fs.mkdirSync('./keys');
  fs.writeFileSync('./keys/judge_pub.pem', pubPem, { encoding: 'utf8' });
  fs.writeFileSync('./keys/judge_priv.pem', privPem, { encoding: 'utf8' });

  console.log('Saved keys to ./keys/judge_pub.pem and ./keys/judge_priv.pem');
  console.log('Public key (first 120 chars):\n', pubPem.slice(0, 120));
}

gen();
