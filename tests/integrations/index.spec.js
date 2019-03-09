const { format } = require("./helper");
const fs = require("fs");
const path = require("path");

describe("prettier-plugin-gherkin", () => {
  it("format `basic.feature` file", () => {
    const fixtureFeatureFile = fs.readFileSync(
      path.join(__dirname, "__fixtures__/basic.feature"),
      { encoding: "utf-8" },
    );

    expect(format(fixtureFeatureFile)).toMatchSnapshot();
  });

  describe("Feature:", () => {
    it("should preserve a long feature title in one line", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

      expect(format(fixture)).toMatchInlineSnapshot(
        `"Feature: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."`,
      );
    });

    it("should break in multiple line a long feature description", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet
  Placerat duis ultricies lacus sed turpis tincidunt id aliquet. Id faucibus nisl tincidunt eget nullam non. Sapien faucibus et molestie ac feugiat sed lectus vestibulum mattis. Et tortor consequat id porta nibh venenatis cras sed felis. Felis eget velit aliquet sagittis id consectetur.
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Lorem ipsum dolor sit amet

  Placerat duis ultricies lacus sed turpis tincidunt id aliquet. Id faucibus
  nisl tincidunt eget nullam non. Sapien faucibus et molestie ac feugiat sed
  lectus vestibulum mattis. Et tortor consequat id porta nibh venenatis cras sed
  felis. Felis eget velit aliquet sagittis id consectetur."
`);
    });

    it("should reformat multiple line feature description", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet
  Placerat duis ultricies 
  lacus sed turpis tincidunt id aliquet. Id 

  faucibus nisl tincidunt eget nullam non. Sapien faucibus et molestie ac 
  feugiat sed lectus vestibulum mattis. Et tortor consequat id porta nibh venenatis cras sed felis. Felis eget velit aliquet sagittis id consectetur.
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
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

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Lorem ipsum dolor sit amet

  Placerat duis ultricies"
`);
    });
  });

  describe("Scenario:", () => {
    it("should preserve a long scenario title in one line", () => {
      const fixture = `Feature: Some feature
  Scenario: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Some feature

  Scenario: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
`);
    });

    it("should break in multiple line a long scenario description", () => {
      const fixture = `Feature: Some feature title
  Scenario: Some scenario title
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Some feature title

  Scenario: Some scenario title
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
    tempor incididunt ut labore et dolore magna aliqua."
`);
    });

    it("should introduce a blank line between the scenario title and description (if any)", () => {
      const fixture = `Feature: Some feature title
    Scenario: Some scenario title
      Lorem ipsum dolor sit amet.
  `;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Some feature title

  Scenario: Some scenario title
    Lorem ipsum dolor sit amet."
`);
    });

    it("could also be named `Example`", () => {
      const fixture = `Feature: Some feature title
  Example: Some scenario title
    Lorem ipsum dolor sit amet.
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Some feature title

  Example: Some scenario title
    Lorem ipsum dolor sit amet."
`);
    });
  });

  describe("Steps", () => {
    it("will be put one after the others", () => {
      const fixture = `Feature: Some feature title
  Scenario: Some scenario title
    Given step a
    And step b
    But step c
    When step d
    Then step e
    And step f
    But step g
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Some feature title

  Scenario: Some scenario title
    Given step a
    And step b
    But step c
    When step d
    Then step e
    And step f
    But step g"
`);
    });

    it("should preserve a long step in one line", () => {
      const fixture = `Feature: Some feature title
  Scenario: Some scenario title
    Given lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Some feature title

  Scenario: Some scenario title
    Given lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua"
`);
    });
  });

  describe("Step Arguments", () => {
    describe("Doc Strings", () => {});
    describe("Data Tables", () => {});
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

  describe("Tags", () => {
    it("can be before a Feature element", () => {
      const fixture = `  @important   @ui   
Feature: Lorem ipsum dolor sit amet
    `;

      expect(format(fixture)).toMatchInlineSnapshot(`
"@important @ui
Feature: Lorem ipsum dolor sit amet"
`);
    });

    it("can be before a Scenario element", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet
      @important   @ui   
  Scenario: Id faucibus nisl tincidunt eget nullam non 
    `;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Lorem ipsum dolor sit amet

  @important @ui
  Scenario: Id faucibus nisl tincidunt eget nullam non"
`);
    });

    it("can be before a Examples element", () => {
      const fixture = `Feature: Lorem ipsum dolor sit amet
    @important   @ui   
Example: Id faucibus nisl tincidunt eget nullam non 
  `;

      expect(format(fixture)).toMatchInlineSnapshot(`
"Feature: Lorem ipsum dolor sit amet

  @important @ui
  Example: Id faucibus nisl tincidunt eget nullam non"
`);
    });

    it.todo("can be before a Scenario Outline element");
  });

  describe("Comments", () => {
    it("should be preserved", () => {
      const fixture = `# Some comment
Feature: Lorem ipsum dolor sit amet
`;

      expect(format(fixture)).toMatchInlineSnapshot(`
"# Some comment
Feature: Lorem ipsum dolor sit amet"
`);
    });

    it.todo("should indented depending on where there are located");
  });
});
