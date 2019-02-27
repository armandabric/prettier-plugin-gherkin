workflow "New workflow" {
  on = "push"
  resolves = [
    "docker://node:11-alpine-1",
    "docker://node:11-alpine-2",
  ]
}

action "docker://node:11-alpine" {
  uses = "docker://node:11-alpine"
  runs = "yarn install"
}

action "docker://node:11-alpine-1" {
  uses = "docker://node:11-alpine"
  needs = ["docker://node:11-alpine"]
  runs = "yarn test"
}

action "docker://node:11-alpine-2" {
  uses = "docker://node:11-alpine"
  needs = ["docker://node:11-alpine"]
  runs = "yarn format:check"
}
