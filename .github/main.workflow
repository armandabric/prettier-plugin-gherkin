workflow "Validate changes" {
  on = "push"
  resolves = [
    "run unit test",
    "check formatting",
    "lint code",
  ]
}

action "install dependencies" {
  uses = "docker://node:11-alpine"
  runs = "yarn install --frozen-lockfile"
  env = {
    CI = "true"
  }
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
  env = {
    CI = "true"
  }
}

action "lint code" {
  uses = "docker://node:11-alpine"
  needs = ["install dependencies"]
  runs = "yarn lint"
  env = {
    CI = "true"
  }
}
