const parseNativeGherkinError = require("./parseNativeGherkinError");

/**
 * @from: https://github.com/browserify/syntax-error/blob/95a6b3f4641b855e203ab5e9772539b5ee4a62f3/index.js#L29-L57
 */
class GherkinSyntaxError extends SyntaxError {
  constructor(message, line = null, column = null, fileContent = null) {
    super(message);

    this.line = line;
    this.column = column;

    this.richMessage =
      (fileContent && this.line !== null
        ? "\n" +
          fileContent.split("\n")[this.line - 1] +
          "\n" +
          Array(this.column + 1).join(" ") +
          "^" +
          "\n"
        : "") +
      "GherkinSyntaxError: " +
      this.message;
  }

  static fromNativeErrorMessage(nativeErrorMessage, fileContent) {
    const nativeErrorDetails = parseNativeGherkinError(nativeErrorMessage);

    return new GherkinSyntaxError(
      nativeErrorDetails.message,
      nativeErrorDetails.location.line,
      nativeErrorDetails.location.column,
      fileContent,
    );
  }

  toString() {
    return this.richMessage;
  }

  inspect() {
    return this.richMessage;
  }
}

module.exports = GherkinSyntaxError;
