console.warn(
  'bootstrap:admin устарел. Используйте "npm run bootstrap:owner -- <email> <password>".',
);
require('./bootstrapOwner');
