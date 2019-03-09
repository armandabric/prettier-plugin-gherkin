module.exports = function isNodeOnTopOfFile(oneNode) {
  if (oneNode.type === "feature" && oneNode.tags.length > 0) {
    return oneNode.location.line === 2;
  }

  return oneNode.location.line === 1;
};
