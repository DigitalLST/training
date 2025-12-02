type FooterProps = { version?: string };

export default function Footer({ version = 'v0.2.10' }: FooterProps): React.JSX.Element {
  return (
    <footer style={styles.footer} role="contentinfo" dir="rtl">
      <div style={styles.separator} />
      <div style={styles.centerStack}>
        <div style={styles.title}>المنظومة الرقمية للتدريب </div>

        <div style={styles.metaCenter}>
          <span>© {new Date().getFullYear()} الكشافة التونسية — لجنة التطوير الرقمي</span>
        </div>    
        <div style={styles.metaCenter}>
          <span>{version}</span>
          <span style={styles.dot}>•</span>
          <span>MBD</span>
        </div>
      </div>
    </footer>
  );
}

const styles: Record<string, React.CSSProperties> = {
  footer: { marginTop: 24 },
  separator: { height: 1, background: '#e9edf3', margin: '0 0 12px' },

  // tout centré
  centerStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 8,
    padding: '0 24px 12px',
  },

  title: { fontWeight: 700 },

  metaCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#6b7280',
    fontSize: 14,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  dot: { color: '#9ca3af' },
};