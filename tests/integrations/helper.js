const prettier = require("prettier");

const defaultOptions = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
};

const format = (text, options = defaultOptions) => {
  return prettier.format(text, {
    ...options,
    parser: "gherkin-parser",
    plugins: ["."],
  });
};

module.exports = { defaultOptions, format };
