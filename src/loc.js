// Example from `prettier-plugin-php`:
// > https://github.com/prettier/plugin-php/blob/3bc98438c127abf625ecf48a9fcabe8712c26d92/src/index.js#L48-L50
//
// const loc = prop => node => {
//   return node.loc && node.loc[prop] && node.loc[prop].offset;
// };

function locStart(/*node*/) {
  // console.log(node);
  throw new Error("TODO: to be done when triggered");
}

function locEnd(/*node*/) {
  // console.log(node);
  throw new Error("TODO: to be done when triggered");
}

module.exports = {
  locStart,
  locEnd,
};
