#!/usr/bin/env bash
# One-time setup of an Ubuntu 22.04/24.04 VM as the code-execution host.
# Review it, then run as root:  sudo bash setup-vm.sh
# Set INSTALL_GVISOR=0 to skip the gVisor runtime.
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl git gnupg

# Docker Engine from Docker's official repository.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io

# Node.js 22 and pnpm.
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pnpm@9.0.0

# Optional but recommended: gVisor gives each sandbox its own user-space kernel.
# Afterwards set SANDBOX_RUNTIME=runsc in /etc/interviewai/executor.env.
if [ "${INSTALL_GVISOR:-1}" = "1" ]; then
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" > /etc/apt/sources.list.d/gvisor.list
  apt-get update
  apt-get install -y runsc
  runsc install
  systemctl restart docker
fi

id interviewai >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin interviewai
usermod -aG docker interviewai
mkdir -p /etc/interviewai /opt/interviewai
chown interviewai:interviewai /opt/interviewai
[ -f /etc/interviewai/executor.env ] || install -m 600 /dev/null /etc/interviewai/executor.env

echo "Done. Next: clone the repository into /opt/interviewai, build the executor,"
echo "put REDIS_URL in /etc/interviewai/executor.env and enable the service (see DEPLOYMENT.md)."
