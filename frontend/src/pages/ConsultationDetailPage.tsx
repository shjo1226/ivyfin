import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ConsultationDetailPage.css';

interface Consultation {
  id: string;
  type: string;
  status: string;
  messages: any; // Can be Array<Message> or Json
  createdAt: string;
}

interface ConsultationRecord {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerBirthDate: string | null;
  status: string;
  sourceType: string;
  interestAreas: string[];
  visitRegion: string | null;
  visitAddress: string | null;
  visitAddressType: string | null;
  preferredVisitYear: number | null;
  preferredVisitMonth: number | null;
  preferredVisitDay: number | null;
  preferredVisitTime: string | null;
  preferredVisitTimePeriod: string | null;
  notes: string | null;
  createdAt: string;
  consultations: Consultation[];
}

const ConsultationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const [record, setRecord] = useState<ConsultationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        const isAdminView = location.pathname.startsWith('/admin/');
        const endpoint = isAdminView
          ? `http://localhost:3005/api/consultations/records/${id}`
          : `http://localhost:3005/api/consultations/me/records/${id}`;
        const response = await fetch(endpoint, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined,
        });
        if (!response.ok) {
          throw new Error('데이터를 불러오는데 실패했습니다.');
        }
        const data = await response.json();
        setRecord(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRecord();
  }, [id, location.pathname, token]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatVisitDate = (record: ConsultationRecord) => {
    if (!record.preferredVisitYear) return '미지정';
    return `${record.preferredVisitYear}년 ${record.preferredVisitMonth}월 ${record.preferredVisitDay}일 ${record.preferredVisitTimePeriod || ''} ${record.preferredVisitTime || ''}`;
  };

  const backTarget = location.pathname.startsWith('/admin/')
    ? '/admin/consultations'
    : '/records';

  if (loading) return <div className="detail-container">로딩 중...</div>;
  if (error || !record) return <div className="detail-container">오류: {error || '기록을 찾을 수 없습니다.'}</div>;

  return (
    <div className="detail-container">
      <header className="detail-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate(backTarget)}>
            ← 목록으로
          </button>
          <h1>상담 상세 내역</h1>
        </div>
        <div className="header-right">
          <span className={`badge badge-status-${record.status.toLowerCase()}`}>
            {record.status === 'submitted' ? '접수완료' : 
             record.status === 'interrupted' ? '상담중단' : '상담중'}
          </span>
          <span className={`badge badge-type-${record.sourceType.toLowerCase()}`}>
            {record.sourceType === 'chat' ? '채팅상담' : '전화상담'}
          </span>
        </div>
      </header>

      <section className="customer-summary glass-card">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">고객명</span>
            <span className="summary-value">{record.customerName}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">연락처</span>
            <span className="summary-value">{record.customerPhone || '-'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">생년월일</span>
            <span className="summary-value">{record.customerBirthDate || '-'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">접수일시</span>
            <span className="summary-value">{formatDate(record.createdAt)}</span>
          </div>
        </div>

        {record.interestAreas && record.interestAreas.length > 0 && (
          <div className="record-detail-section">
            <span className="section-title">관심 분야</span>
            <div className="interest-tags">
              {record.interestAreas.map((area, idx) => (
                <span key={idx} className="interest-tag">{area}</span>
              ))}
            </div>
          </div>
        )}

        <div className="record-detail-section">
          <span className="section-title">방문 예약 정보</span>
          <div className="visit-info-grid">
            <div className="info-item">
              <span className="info-label">희망 일시</span>
              <span className="info-value">{formatVisitDate(record)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">방문 지역</span>
              <span className="info-value">{record.visitRegion || '-'}</span>
            </div>
            {record.visitAddress && (
              <div className="info-item full-width">
                <span className="info-label">상세 주소 ({record.visitAddressType})</span>
                <span className="info-value">{record.visitAddress}</span>
              </div>
            )}
          </div>
        </div>

        {record.notes && (
          <div className="record-detail-section">
            <span className="section-title">상담 메모</span>
            <div className="notes-content">{record.notes}</div>
          </div>
        )}
      </section>

      <div className="session-container">
        {record.consultations.map((session, index) => (
          <div key={session.id} className="session-card glass-card">
            <div className="session-header">
              <span className="session-title">
                {session.type === 'chat' ? '💬 채팅 세션' : '📞 음성 통화 세션'}
                {index === 0 && <span className="badge badge-status-submitted" style={{marginLeft: '8px', fontSize: '10px'}}>최근</span>}
              </span>
              <span className="session-date">{formatDate(session.createdAt)}</span>
            </div>

            {session.type === 'voice' && (
              <div className="voice-player-mock">
                <button className="play-button">▶</button>
                <div className="play-progress">
                  <div className="play-bar"></div>
                </div>
                <span className="play-time">01:45 / 03:20</span>
              </div>
            )}

            <div className="transcript-area">
              {Array.isArray(session.messages) && session.messages.length > 0 ? (
                session.messages.map((msg: any, mIdx: number) => (
                  <div 
                    key={mIdx} 
                    className={`message ${msg.role === 'user' || msg.role === '고객' ? 'message-user' : 'message-assistant'}`}
                  >
                    <span className="message-role">
                      {(msg.role === 'user' || msg.role === '고객') ? '고객' : '상담사'}
                    </span>
                    {msg.content}
                  </div>
                ))
              ) : (
                <p style={{color: 'var(--text-secondary)', textAlign: 'center'}}>대화 기록이 없습니다.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConsultationDetailPage;
