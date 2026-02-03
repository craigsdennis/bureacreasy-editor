FROM docker.io/cloudflare/sandbox:0.7.0
RUN npm install -g opencode-ai
EXPOSE 4321
EXPOSE 8787