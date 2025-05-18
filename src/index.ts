import '@logseq/libs';
import { SuperSyncPlugin } from './core/plugin';

// Entry point of the plugin
function main() {
  // Create and initialize the plugin
  const plugin = new SuperSyncPlugin();
  plugin.initialize().catch(error => {
    console.error('Failed to initialize plugin:', error);
  });
}

// Run the main function when Logseq is ready
logseq.ready(main).catch(console.error);