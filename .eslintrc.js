module.exports = {
  env: {
    es6: true,
    node: true,
    "jest/globals": true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  plugins: ["jest"],
  extends: ["eslint:recommended", "plugin:jest/recommended"],
  rules: {},
};
