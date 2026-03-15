/**
 * remark plugin: Convert ```mermaid code blocks to <pre class="mermaid">
 * This is rendered client-side by the Mermaid library.
 */
import { visit } from 'unist-util-visit';

export default function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return;

      parent.children[index] = {
        type: 'html',
        value: `<pre class="mermaid">${node.value}</pre>`,
      };
    });
  };
}
