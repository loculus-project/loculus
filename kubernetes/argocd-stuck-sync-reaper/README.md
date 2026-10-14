# ArgoCD stuck sync reaper

A CronJob that runs every 5 minutes in the `argocd` namespace and ends ArgoCD syncs that would otherwise stop preview deployments from being cleaned up (see [#7536](https://github.com/loculus-project/loculus/issues/7536)).

ArgoCD only deletes an Application's resources once no sync is running. If a sync is stuck, for example waiting for pods that can't be scheduled, deleting the Application (e.g. when the `preview` label is removed from a PR) never finishes, and its pods keep running.

The job handles apps as follows:

| App                                                       | Action                                                    |
| --------------------------------------------------------- | --------------------------------------------------------- |
| Marked for deletion, sync running                         | End the sync immediately (any app type)                   |
| Preview (`loculus/deployment-type=preview`), sync running | End the sync once it has run for more than 30 minutes     |
| Anything else (production, staging, demo, ...)            | Leave alone; rely on ArgoCD's `controller.sync.timeout.seconds` |

A sync is ended in the same way as `argocd app terminate-op`: the job sets `.status.operationState.phase` to `Terminating` and ArgoCD stops the sync. If an app that is being deleted still has an operation on the next run, the job removes `/operation` directly so that the deletion can go ahead. Every action is logged (`kubectl logs -n argocd job/<job-name>`).

After a preview sync has been ended, ArgoCD does not automatically retry it for the same commit. Pushing a new commit, or syncing manually, starts a new sync.

## Deployment

The directory is a Kustomize base. Deploy it, e.g. with an ArgoCD Application pointing at `kubernetes/argocd-stuck-sync-reaper` of this repo, or with:

```shell
kubectl apply -k kubernetes/argocd-stuck-sync-reaper
```

Preview Applications must carry the label used to identify them. Add it to the ApplicationSet template:

```yaml
template:
  metadata:
    labels:
      loculus/deployment-type: preview
```

Apps without the label are only touched once they are marked for deletion.

It is also worth setting a generous global sync timeout (e.g. 3 hours) as a safety net for all other apps, in `argocd-cmd-params-cm`:

```yaml
data:
  controller.sync.timeout.seconds: "10800"
```

## Configuration

Environment variables of the CronJob container:

| Variable                   | Default                           | Description                                       |
| -------------------------- | --------------------------------- | ------------------------------------------------- |
| `PREVIEW_LABEL_SELECTOR`   | `loculus/deployment-type=preview` | Label selector identifying preview Applications   |
| `MAX_PREVIEW_SYNC_SECONDS` | `1800`                            | How long a preview sync may run before it's ended |
| `DRY_RUN`                  | `false`                           | If `true`, only log what would be done            |
