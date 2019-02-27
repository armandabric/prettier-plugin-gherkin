workflow "New workflow" {
  on = "push"
  resolves = [
    "run unit test",
    "check formatting",
  ]
}

action "install dependencies" {
  uses = "docker://node:11-alpine"
  runs = "yarn install"
}

action "run unit test" {
  uses = "docker://node:11-alpine"
  needs = ["install dependencies"]
  runs = "yarn test"
}

action "check formatting" {
  uses = "docker://node:11-alpine"
  needs = ["install dependencies"]
  runs = "yarn format:check"
}
