const { hashPassword, validatePassword } = require('../security');

const plainPassword = process.argv[2];
const passwordError = validatePassword(plainPassword);

if (passwordError) {
  console.error(passwordError);
  process.exit(1);
}

const passwordHash = hashPassword(plainPassword);
console.log(passwordHash);
