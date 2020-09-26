const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
let changes = require(`${process.env.HOME}/files.json`);

const context = github.context;
const payload = context.payload;
const repo = payload.repository;
const owner = repo.owner.name;

const octokit = github.getOctokit(core.getInput("token"));


/**
 * Fetches a list of functions from the repo's REST
 * folder at a specific commit.
 *
 * @param {String} sha the commit identifier to inspect
 */
async function getFunctionsSnapshot(sha) {
  return new Promise(async function (resolve, reject) {
    let response = await octokit.request(
      `GET /repos/{owner}/{repo}/contents/REST?ref={ref}`,
      {
        owner: owner,
        repo: repo.name,
        ref: sha,
      }
    );

    let functions = response.data.map((folder) => {
      return folder.name;
    });
    resolve(functions);
  });
}

/**
 * Returns a list of functions that have been modified by the
 * the current commit. Ensures that modified functions are
 * distinct from those that were apart of a create/delete
 * operation.
 *
 * @param {[String]} created the functions created by the current commit
 * @param {[String]} deleted the functions deleted by the current commit
 */
async function processFileUpdates(created, deleted) {
  return new Promise(async function(resolve, reject) {
    const modified = [];
    for (i in changes) {
      var path = changes[i];
      var start = path.indexOf("/") + 1;
      var end = path.indexOf("/", start);
      let dir = path.substring(start, end);
      // If the function is not already in 'created', 'deleted',
      // or 'modified' (to prevent duplicates), add it to 'modified'.
      if (created.indexOf(dir) == -1 &&
          deleted.indexOf(dir) == -1 &&
          modified.indexOf(dir) == -1) {
            modified.push(dir);
      }
    }
    resolve(modified);
  });
}



async function processLambdaChanges(beforeSha, afterSha) {
  return new Promise(async function (resolve, reject) {
    let before = await getFunctionsSnapshot(beforeSha);
    let after = await getFunctionsSnapshot(afterSha);

    const created = after.filter((func) => {
      return before.indexOf(func) == -1;
    });

    const deleted = before.filter((func) => {
      return after.indexOf(func) == -1;
    });

    const updated = await processFileUpdates(created, deleted);
    let updates = {
      created: created,
      deleted: deleted,
      updated: updated,
    };
    resolve(updates);
  });
}


// ----------------- SCRIPT --------------
try {
  processLambdaChanges(payload.before, payload.after)
  .then((updates) => {
    console.log('updates', updates);
    core.setOutput('Updates', updates);
  });
} catch (error) {
  core.setFailed(error.message);
}
