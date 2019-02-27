const parseGherkin = require("./../src/parseGherkin");
const fs = require("fs");
const path = require("path");

describe("parseGherkin", () => {
  it("parse basic feature file into an AST", async () => {
    const basicFeature = fs.readFileSync(
      path.join(__dirname, "fixtures/basic.feature"),
      { encoding: "utf-8" },
    );

    const ast = await parseGherkin(basicFeature);

    expect(ast).toMatchSnapshot();
  });
});
