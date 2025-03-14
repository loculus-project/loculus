# How to add a dedicated worker node to a k3s cluster on Hetzner

This guide will show you how to add a dedicated worker node to a k3s cluster on Hetzner. It will go through network setup and k3s installation on the worker node.

## Prerequisites

- A single node k3s cluster running on a dedicated server on Hetzner
- A dedicated server on Hetzner that will be used as a worker node

## Network setup

### Configuring virtual private network using vSwitch

First, you need to set up the network between the master node and the worker node. Having a private network between the nodes is a good practice for security reasons and also better for performance.

#### Create a vSwitch

Hetzner provides a feature called vSwitch that allows you to create a private network between your servers. You can create a vSwitch in the Hetzner Cloud Console following the short prerequisites section of the Hetzner docs here: "https://docs.hetzner.com/cloud/networks/connect-dedi-vswitch/#on-the-dedicated-root-server-side". We will assume you set the VLAN ID to 4000 as in the Hetzner docs.

You need to add both nodes: the master and the worker to the vSwitch.

#### Configure the network on the worker node using ip commands

Next, you need to configure the network interface to use the private network. You can do this using the `ip` command. First, you need to find the name of the network interface. Run `ip a` to list all network interfaces. The one we're looking for is the one that has the public IP address assigned to it. In my case, it's `enp6s0` on the worker node and `enp9s0` on the master node.

The following set of commands will now configure the network interface for the private network:

```bash
IFACE=enp6s0 # Change this to the name of your network interface
VLAN_ID=4000 # Change this to the VLAN ID you set in the Hetzner Cloud Console

sudo ip link add link $IFACE name $IFACE.$VLAN_ID type vlan id $VLAN_ID
sudo ip link set $IFACE.$VLAN_ID mtu 1400
sudo ip link set dev $IFACE.$VLAN_ID up
```

The last step is to assign an IP address to the network interface. You can choose any IP address that is not already in use on the private network. In this example, we will use the private IP address range `10.10.0.1-255` for the private network which should be fine for most cases - unless you have a specific requirement to use a different range.

Server and agent nodes should have different IP addresses. We will use `10.10.0.1` for the server node and `10.10.0.2` for the agent node.

Run the following on each node you want to add, with different IP addresses:

```bash
NODE_IP=10.10.0.1 # Change this to the IP address you want to assign to the node

sudo ip addr add $NODE_IP/24 brd 10.10.0.255 dev $IFACE.$VLAN_ID
```

### Test the network

You can now test the network by pinging the other node. On the worker node, run:

```bash
SERVER_IP=10.10.0.1
ping $SERVER_IP
```

and vice versa on the server node.

## Configure k3s on the worker node


