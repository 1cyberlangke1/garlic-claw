module.exports = {
  ...require('./dist/authoring/builtin-observers.js'),
  ...require('./dist/authoring/builtin-manifests.js'),
  ...require('./dist/authoring/builtin-results.js'),
  ...require('./dist/authoring/common-helpers.js'),
  ...require('./dist/authoring/conversation-helpers.js'),
  ...require('./dist/authoring/prompt-helpers.js'),
  ...require('./dist/authoring/router-helpers.js'),
  ...require('./dist/authoring/transport.js'),
};
