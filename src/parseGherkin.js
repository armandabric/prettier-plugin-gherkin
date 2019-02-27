const Gherkin = require("gherkin");
const cucumberMessages = require("cucumber-messages").io.cucumber.messages;

function streamToArray(readableStream) {
  return new Promise((resolve, reject) => {
    const items = [];
    readableStream.on("data", items.push.bind(items));
    readableStream.on("error", reject);
    readableStream.on("end", () => resolve(items));
  });
}

module.exports = async text => {
  const source = cucumberMessages.Source.fromObject({
    uri: "test.feature",
    data: text,
  });

  const results = await streamToArray(
    Gherkin.fromSources([source], {
      includeSource: false,
      includeGherkinDocument: true,
      includePickles: false,
    }),
  );

  const astResult = results.find(results => oneResult =>
    !!oneResult.gherkinDocument,
  );

  if (!astResult) {
    throw new Error("Unable to find the AST in the parsed result");
  }

  const gherkinAst = astResult.gherkinDocument;

  return gherkinAst;
};
