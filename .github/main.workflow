workflow "Validate changes" {
  on = "push"
  resolves = [
    "run unit test",
    "check formatting",
  ]
}

action "install dependencies" {
  uses = "docker://node:11-alpine"
  runs = "yarn install --frozen-lockfile"
}

action "run unit test" {
  uses = "docker://node:11-alpine"
  needs = ["install dependencies"]
  runs = "yarn test"
  env = {
    CI = "true"
  }
}

action "check formatting" {
  uses = "docker://node:11-alpine"
  needs = ["install dependencies"]
  runs = "yarn format:check"
}
