import React from 'react';
import SignaturePad from './SignaturePad';

const RED = '#e20514';

type SignatureModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => Promise<void> | void;
};

export default function SignatureModal({ open, onClose, onSave }: SignatureModalProps) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setDataUrl(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    if (!dataUrl) return;
    try {
      setSaving(true);
      await onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 18,
          width: '90%',
          maxWidth: 480,
          boxShadow: '0 10px 28px rgba(0,0,0,.25)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
          الرجاء إدخال توقيعك
        </div>

        <div style={{ fontSize: 13, color: '#4b5563' }}>
          سيتم حفظ هذا التوقيع واستعماله في المصادقات القادمة والشهادات.
        </div>

        <SignaturePad onChange={setDataUrl} />

        <div
          style={{
            marginTop: 8,
            display: 'grid',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: 999,
              border: '1px solid #d1d5db',
              background: '#fff',
              padding: '6px 16px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!dataUrl || saving}
            style={{
              borderRadius: 999,
              border: 'none',
              background: !dataUrl || saving ? '#9ca3af' : RED,
              color: '#fff',
              padding: '6px 16px',
              fontSize: 13,
              cursor: !dataUrl || saving ? 'default' : 'pointer',
            }}
          >
            {saving ? '… جاري الحفظ' : 'حفظ التوقيع'}
          </button>
        </div>
      </div>
    </div>
  );
}
