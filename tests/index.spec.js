const prettier = require("prettier");
const fs = require("fs");
const path = require("path");

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

describe("prettier-plugin-gherkin", () => {
  it("format `basic.feature` file", () => {
    const fixtureFeatureFile = fs.readFileSync(
      path.join(__dirname, "fixtures/basic.feature"),
      { encoding: "utf-8" },
    );

    const sut = format(fixtureFeatureFile);

    expect(sut).toMatchSnapshot();
  });

  describe("Feature:", () => {
    it("should preserve a long feature title in one line", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

      const formattedFixture = format(fixture);

      expect(formattedFixture).toMatchInlineSnapshot(
        `"Feature: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."`,
      );
    });

    it("should break in multiple line a long feature description", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet
  Placerat duis ultricies lacus sed turpis tincidunt id aliquet. Id faucibus nisl tincidunt eget nullam non. Sapien faucibus et molestie ac feugiat sed lectus vestibulum mattis. Et tortor consequat id porta nibh venenatis cras sed felis. Felis eget velit aliquet sagittis id consectetur.
`;

      const formattedFixture = format(fixture);

      expect(formattedFixture).toMatchInlineSnapshot(`
"Feature: Lorem ipsum dolor sit amet

  Placerat duis ultricies lacus sed turpis tincidunt id aliquet. Id faucibus
  nisl tincidunt eget nullam non. Sapien faucibus et molestie ac feugiat sed
  lectus vestibulum mattis. Et tortor consequat id porta nibh venenatis cras sed
  felis. Felis eget velit aliquet sagittis id consectetur."
`);
    });

    it("should introduce a blank line between the feature title and description (if any)", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet
Placerat duis ultricies
`;

      const formattedFixture = format(fixture);

      expect(formattedFixture).toMatchInlineSnapshot(`
"Feature: Lorem ipsum dolor sit amet

  Placerat duis ultricies"
`);
    });
  });

  describe("Example:", () => {
    it.todo("should break in multiple line a long example title");
    it.todo("should break in multiple line a long example description");
    it.todo(
      "should introduce a blank line between the example title and description (if any)",
    );
  });

  describe("Scenario:", () => {
    it.todo("should break in multiple line a long scenario title");
    it.todo("should break in multiple line a long scenario description");
    it.todo(
      "should introduce a blank line between the scenario title and description (if any)",
    );
  });

  describe("Rule:", () => {
    it.todo("should break in multiple line a long rule title");
    it.todo("should break in multiple line a long rule description");
    it.todo(
      "should introduce a blank line between the rule title and description (if any)",
    );
  });

  describe("Background:", () => {});

  describe("Scenario Outline:", () => {});

  describe("Steps", () => {});

  describe("Step Arguments", () => {
    describe("Doc Strings", () => {});
    describe("Data Tables", () => {});
  });

  describe("Tags", () => {
    it.todo("can be before a Feature element");
    it.todo("can be before a Scenario element");
    it.todo("can be before a Scenario Outline element");
    it.todo("can be before a Examples element");
  });
});
