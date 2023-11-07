k3d cluster create mycluster -p "3000:30081@agent:0"  -p "8079:30082@agent:0" -v "$(pwd):/repo"  --agents 2 

helm install preview kubernetes/preview --set mode=e2e --set branch=latest --set namespace=test --set dockerconfigjson=[mysecret]
