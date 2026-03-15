/**
 * remark plugin: Keep <details><summary> from being wrapped in <p> tags
 * Since details blocks are now converted to HTML during migration,
 * this plugin is a no-op placeholder kept for future use.
 */
export default function remarkDetails() {
  return (tree) => {
    // Details are now handled during migration as raw HTML
    // This plugin is kept as a no-op for potential future use
  };
}
