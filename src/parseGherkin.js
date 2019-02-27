const Gherkin = require("gherkin");
const cucumberMessages = require("cucumber-messages").io.cucumber.messages;

// FIXME: Parse synchronously the AST: no await, no stream...
function extactAstFromDocuments(readableStream) {
  return new Promise((resolve, reject) => {
    let astDocument = null;

    readableStream.on("error", err => reject(err));
    readableStream.on("data", someDocument => {
      if (!someDocument.gherkinDocument) {
        return;
      }

      astDocument = someDocument;
    });
    readableStream.on("end", () => resolve(astDocument.gherkinDocument));
  });
}

module.exports = async text => {
  const source = cucumberMessages.Source.fromObject({
    uri: "test.feature",
    data: text,
  });

  const ast = await extactAstFromDocuments(
    Gherkin.fromSources([source], {
      includeSource: false,
      includeGherkinDocument: true,
      includePickles: false,
    }),
  );

  return ast;
};
