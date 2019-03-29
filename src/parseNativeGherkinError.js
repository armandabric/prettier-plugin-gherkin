const parseNativeGherkinError = error => {
  const parseRegex = /\(([0-9]+):([0-9]+)\): (.*)/gm;

  const result = parseRegex.exec(error.toString());

  const line = result[1] ? parseInt(result[1], 10) : null;
  const column = result[2] ? parseInt(result[2], 10) : null;
  const message = result[3] ? result[3].trim() : error;

  return {
    originalError: error,
    message,
    location: {
      line,
      column,
    },
  };
};

module.exports = parseNativeGherkinError;
