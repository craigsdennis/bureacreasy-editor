import { getSandbox } from "@cloudflare/sandbox";
import { Agent, callable } from "agents";

export type EditorState = {
    previewUrl?: string;
}

export class EditorAgent extends Agent<Env, EditorState> {
    initialState = {
        
    }

    @callable()
    async setup({hostname}: {hostname: string}) {
        const sandbox = getSandbox(this.env.Sandbox, `preview-${this.name}`);
        // Git checkout
        const repoUrl = "https://github.com/craigsdennis/tacoyell-marketing-site";
        await sandbox.gitCheckout(repoUrl, {depth: 1});
        // npm run dev - ??? Does it autorestart?
        await sandbox.startProcess("npm run dev");
        // Set preview url
        const results = await sandbox.exposePort(4321, {
            hostname
        });
        this.setState({
            ...this.state,
            previewUrl: results.url
        })
    }



}