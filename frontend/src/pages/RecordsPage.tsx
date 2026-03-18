import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './RecordsPage.css';

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
}

const RecordsPage: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<ConsultationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const response = await fetch('http://localhost:3005/api/consultations/records');
        if (!response.ok) {
          throw new Error('데이터를 불러오는데 실패했습니다.');
        }
        const data = await response.json();
        setRecords(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
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

  if (loading) {
    return (
      <div className="records-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>상담 내역을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="records-container">
        <div className="error-message">
          <h2>오류 발생</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      </div>
    );
  }

  return (
    <div className="records-container">
      <header className="records-header">
        <h1>방문 상담 예약 내역</h1>
        <p>전체 상담 기록 및 방문 예약 현황을 한눈에 확인하세요.</p>
      </header>

      <div className="records-grid">
        {records.length === 0 ? (
          <div className="no-records">
            <h3>내역이 없습니다.</h3>
            <p>아직 접수된 상담 내역이 없습니다.</p>
          </div>
        ) : (
          records.map((record) => (
            <div 
              key={record.id} 
              className="record-card glass-card clickable" 
              onClick={() => navigate(`/records/${record.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="record-badges">
                <span className={`badge badge-status-${record.status.toLowerCase()}`}>
                  {record.status === 'submitted' ? '접수완료' : '진행중'}
                </span>
                <span className={`badge badge-type-${record.sourceType.toLowerCase()}`}>
                  {record.sourceType === 'chat' ? '채팅상담' : '전화상담'}
                </span>
              </div>

              <div className="record-info">
                <div className="info-item">
                  <span className="info-label">고객명</span>
                  <span className="info-value">{record.customerName}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">연락처</span>
                  <span className="info-value">{record.customerPhone || '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">생년월일</span>
                  <span className="info-value">{record.customerBirthDate || '-'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">접수일시</span>
                  <span className="info-value">{formatDate(record.createdAt)}</span>
                </div>
              </div>

              {record.interestAreas && record.interestAreas.length > 0 && (
                <div className="record-section">
                  <span className="section-title">관심 분야</span>
                  <div className="interest-tags">
                    {record.interestAreas.map((area, idx) => (
                      <span key={idx} className="interest-tag">{area}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="record-section">
                <span className="section-title">방문 예약 정보</span>
                <div className="visit-info">
                  <div><strong>희망 일시:</strong> {formatVisitDate(record)}</div>
                  <div><strong>방문 지역:</strong> {record.visitRegion || '-'}</div>
                  {record.visitAddress && (
                    <div><strong>상세 주소:</strong> {record.visitAddress} ({record.visitAddressType})</div>
                  )}
                </div>
              </div>

              <div className="record-action" style={{marginTop: 'auto', paddingTop: '16px', textAlign: 'right'}}>
                <button className="btn btn-secondary btn-small" style={{fontSize: '0.8rem', padding: '6px 12px'}}>
                  상세보기
                </button>
              </div>

              <div className="record-footer">
                ID: {record.id.slice(0, 8)}...
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecordsPage;
