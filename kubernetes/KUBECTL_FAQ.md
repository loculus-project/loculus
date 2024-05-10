# Tips for working with kubernetes

## Show all pods in all namespaces

```shell
kubectl get pods --all-namespaces
```

(you can use `-A` instead of `--all-namespaces`)

## Show resource usage of all pods in all namespaces

```shell
kubectl top pods --all-namespaces --sum=true
```

If you want to see resource usage with container granularity, add `--containers=true`:

```shell
kubectl top pods --all-namespaces --containers=true
```

## Show resource usage of all nodes

```shell
$ kubectl top nodes
NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
pp-hetzner01   4250m        35%    53130Mi         82%
```

## Show resource limits and requests for all pods in all namespaces

```shell
kubectl get pods -o "custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,MEMORY_REQUESTS:.spec.containers[*].resources.requests.memory,MEMORY_LIMITS:.spec.containers[*].resources.limits.memory,CPU_REQUESTS:.spec.containers[*].resources.requests.cpu,CPU_LIMITS:.spec.containers[*].resources.limits.cpu" -A | sort
```
