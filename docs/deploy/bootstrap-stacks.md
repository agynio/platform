---
title: Bootstrap Stacks
description: Understand the Terraform stacks used by agynio/bootstrap.
order: 1
---

# Bootstrap Stacks

`agynio/bootstrap` splits infrastructure into Terraform stacks.

The README documents this manual order:

```sh
terraform -chdir=stacks/k8s init && terraform -chdir=stacks/k8s apply
terraform -chdir=stacks/system init && terraform -chdir=stacks/system apply
terraform -chdir=stacks/routing init && terraform -chdir=stacks/routing apply
terraform -chdir=stacks/data init && terraform -chdir=stacks/data apply
terraform -chdir=stacks/platform init && terraform -chdir=stacks/platform apply
```

`stacks/system` creates namespaces including `cert-manager`, `ziti`, `istio-system`, `istio-gateway`, and `argocd`.

`stacks/routing` defines Istio Gateways and VirtualServices.

`stacks/platform` installs service charts such as gateway, agents, chat, threads, files, LLM, secrets, authorization, identity, users, runners, and organizations.
