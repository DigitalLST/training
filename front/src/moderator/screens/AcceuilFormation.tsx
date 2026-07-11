import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type SessionRow = {
  id: string;
  title: string;
  period: string;
  visible: boolean;
  trainingLevels: string[];
  branches: string[];
};

const PAGE_TITLES: Record<string, string> = {
  '/moderator/': '',
};

const RED = '#e20514';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

export default function Acceuilormation(): React.JSX.Element {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = localStorage.getItem('token');

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const response = await fetch(
          `${API_BASE}/sessions?ts=${Date.now()}`,
          {
            headers: authHeaders(),
            cache: 'no-store',
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as any[];

        const formatMonth = (iso?: string): string => {
          if (!iso) return '—';

          return new Date(iso).toLocaleDateString('ar-TN', {
            year: 'numeric',
            month: 'long',
          });
        };

        const normalizeArray = (value: any): string[] => {
          if (!Array.isArray(value)) return [];

          return value
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean);
        };

        const mapped: SessionRow[] = data.map((session) => {
          const trainingLevels = normalizeArray(
            session.trainingLevels ??
              session.trainingLevel ??
              session.levels ??
              session.level,
          );

          const branches = normalizeArray(
            session.branche ??
              session.branches ??
              session.branch,
          );

          return {
            id: String(session._id ?? session.id),
            title: String(session.title ?? '').trim(),
            period: formatMonth(session.startDate),
            visible: Boolean(
              session.isVisible ??
                session.isvisible ??
                false,
            ),
            trainingLevels,
            branches,
          };
        });

        const allowedLevels = new Set([
          'تمهيدية',
          'شارة خشبية',
        ]);

        const filtered = mapped.filter((row) =>
          row.trainingLevels.some((level) =>
            allowedLevels.has(level),
          ),
        );

        setRows(filtered);
      } catch (error: any) {
        setErr(error.message || 'تعذر الجلب');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function goToCriteres(
    sessionId: string,
    niveau: string,
  ): void {
    sessionStorage.setItem(
      'criteres:selection',
      JSON.stringify({
        sessionId,
        niveau,
      }),
    );

    nav('/moderator/listeformations', {
      state: {
        sessionId,
        niveau,
      } as {
        sessionId: string;
        niveau: string;
      },
      replace: false,
    });
  }

  function onBack(): void {
    nav('/moderator/');
  }

const [downloadingSessionId, setDownloadingSessionId] = useState<string | null>(null);

async function downloadTraineesList(row: SessionRow): Promise<void> {
  try {
    setDownloadingSessionId(row.id);

    const token = localStorage.getItem('token');

    const response = await fetch(
      `${API_BASE}/download-data/sessions/${row.id}/trainees.zip`,
      {
        method: 'GET',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      },
    );

    if (!response.ok) {
      let message = `Erreur ${response.status}`;

      try {
        const error = await response.json();
        message = error.error || error.message || message;
      } catch (_) {}

      throw new Error(message);
    }

    const blob = await response.blob();

    let fileName = `قائمة المتدربين - ${row.title}.zip`;

    const disposition = response.headers.get('content-disposition');

    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);

      if (utf8Match?.[1]) {
        fileName = decodeURIComponent(utf8Match[1]);
      } else {
        const normalMatch = disposition.match(/filename="?([^"]+)"?/i);

        if (normalMatch?.[1]) {
          fileName = normalMatch[1];
        }
      }
    }

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;

    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } catch (e: any) {
    console.error(e);

    alert(e.message || 'تعذر تحميل الملف');
  } finally {
    setDownloadingSessionId(null);
  }
}

  const pageTitle = PAGE_TITLES[pathname] ?? '';

  const renderLevelButtons = (
    sessionId: string,
    levels: string[],
  ): React.JSX.Element => {
    if (!levels?.length) {
      return (
        <span style={{ opacity: 0.6 }}>
          —
        </span>
      );
    }

    return (
      <div
        style={styles.badges}
        aria-label="levels"
      >
        {levels.map((level, index) => (
          <button
            key={`${sessionId}-${level}-${index}`}
            type="button"
            title={`اختر المستوى: ${level}`}
            onClick={() =>
              goToCriteres(sessionId, level)
            }
            style={styles.badgeButton}
          >
            {level}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div style={styles.page}>
      {pageTitle && (
        <span style={styles.pageTitle}>
          {pageTitle}
        </span>
      )}

      <div style={styles.toolbar} dir="rtl">
        <div style={styles.toolbarRight}>
          <button
            type="button"
            onClick={onBack}
            style={styles.circleRedBtn}
            aria-label="رجوع"
          >
            <ArrowRightIcon />
          </button>

          <span>
            إدارة الدراسات التدريبية
          </span>
        </div>
      </div>

      <div style={styles.redLine} />

      {loading && (
        <div style={styles.loading}>
          … جاري التحميل
        </div>
      )}

      {err && (
        <div style={styles.error}>
          ❌ {err}
        </div>
      )}

      <div style={styles.list}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={styles.item}
            dir="rtl"
          >
            <div style={styles.itemRight}>
              <div style={styles.itemTitle}>
                {row.title} - {row.period}
              </div>

              <div style={styles.metaBlock}>
                <div style={styles.metaLine}>
                  <span style={styles.metaLabel}>
                    المستوى التدريبي:
                  </span>

                  {renderLevelButtons(
                    row.id,
                    row.trainingLevels,
                  )}
                </div>
              </div>
            </div>

            <div style={styles.actions}>
              <button
  type="button"
  onClick={() => downloadTraineesList(row)}
  style={styles.downloadButton}
  disabled={downloadingSessionId === row.id}
>
  <DownloadIcon />

  <span>
    {downloadingSessionId === row.id
      ? 'جاري إعداد الملف...'
      : 'تحميل قائمة المتدربين'}
  </span>
</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    width: '90vw',
    marginLeft: 20,
    marginRight: 20,
    paddingInline: 24,
  },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 20,
  },

  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },

  pageTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#1f2937',
    marginBottom: 100,
  },

  redLine: {
    height: 3,
    background: RED,
    opacity: 0.9,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 8,
  },

  circleRedBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: 'transparent',
    border: `3px solid ${RED}`,
    color: RED,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },

  loading: {
    color: '#6b7280',
  },

  error: {
    color: '#b91c1c',
  },

  list: {
    display: 'grid',
    gap: 14,
  },

  item: {
    width: '97%',
    background: '#fff',
    borderRadius: 22,
    border: '1px solid #e9edf3',
    boxShadow:
      '0 10px 24px rgba(0,0,0,.05)',
    padding: '16px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    minHeight: 78,
  },

  itemRight: {
    display: 'grid',
    justifyItems: 'start',
    gap: 6,
    minWidth: 0,
    flex: 1,
  },

  itemTitle: {
    fontSize: 18,
    fontWeight: 200,
    color: '#374151',
  },

  metaBlock: {
    display: 'grid',
    gap: 4,
  },

  metaLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  metaLabel: {
    fontSize: 13,
    color: '#6b7280',
  },

  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },

  badgeButton: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${RED}`,
    background: 'transparent',
    color: RED,
    cursor: 'pointer',
    lineHeight: 1.6,
  },

  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 0,
    direction: 'ltr',
  },

  downloadButton: {
    minHeight: 42,
    padding: '8px 14px',
    borderRadius: 12,
    border: `1px solid ${RED}`,
    background: '#fff',
    color: RED,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    direction: 'rtl',
  },
};

function ArrowRightIcon(): React.JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M8 5l8 7-8 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon(): React.JSX.Element {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 3v12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M7 10l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M5 20h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}