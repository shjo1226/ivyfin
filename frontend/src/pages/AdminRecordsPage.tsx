import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminRecordsPage.css';

interface ConsultationRecord {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerBirthDate: string | null;
  status: string;
  sourceType: string;
  interestAreas: string[];
  recentMedicalHistory: string | null;
  currentMedicationStatus: string | null;
  currentInsuranceSummary: string | null;
  monthlyPremium: string | null;
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

const AdminRecordsPage: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<ConsultationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const response = await fetch('http://localhost:3005/api/consultations/admin/records');
        if (!response.ok) {
          throw new Error('관리자 예약 내역을 불러오지 못했습니다.');
        }
        const data = await response.json();
        setRecords(data);
      } catch (err: any) {
        setError(err.message || '관리자 데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return records;
    }

    return records.filter((record) =>
      [
        record.customerName,
        record.customerPhone,
        record.customerBirthDate,
        record.visitRegion,
        record.visitAddress,
        record.monthlyPremium,
        ...(record.interestAreas || []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [records, search]);

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatVisitPreference = (record: ConsultationRecord) => {
    const dateParts = [
      record.preferredVisitYear ? `${record.preferredVisitYear}년` : null,
      record.preferredVisitMonth ? `${record.preferredVisitMonth}월` : null,
      record.preferredVisitDay ? `${record.preferredVisitDay}일` : null,
    ].filter(Boolean);
    const timeParts = [
      record.preferredVisitTimePeriod,
      record.preferredVisitTime,
    ].filter(Boolean);

    const combined = [...dateParts, ...timeParts].join(' ');
    return combined || '-';
  };

  const downloadCsv = () => {
    window.location.href = 'http://localhost:3005/api/consultations/admin/records/export';
  };

  if (loading) {
    return <div className="admin-records-page">관리자 예약 내역을 불러오는 중...</div>;
  }

  if (error) {
    return <div className="admin-records-page">{error}</div>;
  }

  return (
    <div className="admin-records-page">
      <header className="admin-records-header">
        <div>
          <p className="admin-eyebrow">Admin Dashboard</p>
          <h1>방문 상담 예약 통합 현황</h1>
          <p className="admin-description">
            전체 방문 상담 예약 내역을 표 형태로 확인하고 엑셀용 파일로 내려받을 수 있습니다.
          </p>
        </div>
        <div className="admin-actions">
          <input
            className="admin-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="고객명, 연락처, 주소로 검색"
          />
          <button className="admin-download-btn" onClick={downloadCsv}>
            엑셀 다운로드
          </button>
        </div>
      </header>

      <section className="admin-summary-grid">
        <div className="admin-summary-card">
          <span className="summary-label">전체 예약</span>
          <strong>{records.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span className="summary-label">접수 완료</span>
          <strong>{records.filter((record) => record.status === 'submitted').length}</strong>
        </div>
        <div className="admin-summary-card">
          <span className="summary-label">진행 중단</span>
          <strong>{records.filter((record) => record.status === 'interrupted').length}</strong>
        </div>
        <div className="admin-summary-card">
          <span className="summary-label">진행 중</span>
          <strong>{records.filter((record) => record.status === 'collecting').length}</strong>
        </div>
      </section>

      <div className="admin-table-shell">
        <table className="admin-records-table">
          <thead>
            <tr>
              <th>상태</th>
              <th>유형</th>
              <th>고객명</th>
              <th>연락처</th>
              <th>생년월일</th>
              <th>관심 분야</th>
              <th>월 보험료</th>
              <th>방문 지역</th>
              <th>상세 주소</th>
              <th>장소 구분</th>
              <th>희망 일정</th>
              <th>기타 메모</th>
              <th>접수 시각</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={13} className="empty-row">
                  표시할 예약 내역이 없습니다.
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr
                  key={record.id}
                  onClick={() => navigate(`/admin/consultations/${record.id}`)}
                  className="clickable-row"
                >
                  <td>
                    {record.status === 'submitted' ? '접수완료' : 
                     record.status === 'interrupted' ? '상담중단' : '상담중'}
                  </td>
                  <td>{record.sourceType === 'chat' ? '채팅' : '음성'}</td>
                  <td>{record.customerName}</td>
                  <td>{record.customerPhone || '-'}</td>
                  <td>{record.customerBirthDate || '-'}</td>
                  <td>{record.interestAreas?.join(', ') || '-'}</td>
                  <td>{record.monthlyPremium || '-'}</td>
                  <td>{record.visitRegion || '-'}</td>
                  <td>{record.visitAddress || '-'}</td>
                  <td>{record.visitAddressType || '-'}</td>
                  <td>{formatVisitPreference(record)}</td>
                  <td>{record.notes || '-'}</td>
                  <td>{formatDateTime(record.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminRecordsPage;
