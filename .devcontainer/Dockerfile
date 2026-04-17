FROM ubuntu:22.04

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    python3-dev \
    python3-pip \
    postgresql-client \
    libpq-dev \
    jq \
    zsh \
    vim \
    nano \
    htop \
    less \
    && rm -rf /var/lib/apt/lists/*

# Install Go 1.25.9
RUN curl -fsSL https://go.dev/dl/go1.25.9.linux-amd64.tar.gz | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:${PATH}"

# Install Node.js via nvm
RUN mkdir -p /root/.nvm && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
ENV NVM_DIR="/root/.nvm"
RUN . "$NVM_DIR/nvm.sh" && \
    nvm install 20 && \
    nvm alias default 20 && \
    node_version="$(nvm version default)" && \
    ln -sf "$NVM_DIR/versions/node/$node_version/bin/node" /usr/local/bin/node && \
    ln -sf "$NVM_DIR/versions/node/$node_version/bin/npm" /usr/local/bin/npm && \
    ln -sf "$NVM_DIR/versions/node/$node_version/bin/npx" /usr/local/bin/npx

# Install golang-migrate for database migrations
RUN set -eux; \
    tmp_dir="$(mktemp -d)"; \
    curl -fsSL https://github.com/golang-migrate/migrate/releases/download/v4.17.1/migrate.linux-amd64.tar.gz \
    | tar -xz -C "$tmp_dir"; \
    mv "$tmp_dir/migrate" /usr/local/bin/migrate; \
    rm -rf "$tmp_dir"

# Install golangci-lint for linting
RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b /usr/local/bin v1.59.0

# Install Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Create vscode user
RUN useradd -m -s /bin/bash vscode && \
    usermod -aG sudo vscode && \
    mkdir -p /etc/sudoers.d && \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/vscode && \
    chmod 0440 /etc/sudoers.d/vscode

# Set up nvm for vscode user
RUN mkdir -p /home/vscode/.nvm && \
    cp -r /root/.nvm/. /home/vscode/.nvm/ && \
    chown -R vscode:vscode /home/vscode/.nvm

# Install git configuration defaults
RUN git config --global core.autocrlf input && \
    git config --global core.safecrlf warn

USER vscode
WORKDIR /workspace
ENV NVM_DIR="/home/vscode/.nvm"
ENV PATH="/usr/local/go/bin:${PATH}"

# Set up shell configuration
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> /home/vscode/.bashrc && \
    echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> /home/vscode/.bashrc && \
    echo 'export PATH="/usr/local/go/bin:$PATH"' >> /home/vscode/.bashrc

# Verify installations
RUN go version && \
    . "$NVM_DIR/nvm.sh" && \
    node --version && \
    npm --version && \
    git --version && \
    migrate --version && \
    psql --version

CMD ["/bin/bash"]
