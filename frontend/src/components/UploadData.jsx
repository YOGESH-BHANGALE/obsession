import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { uploadAPI } from '../api';

export default function UploadData({ caseId, onDataIngested }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dataType, setDataType] = useState('cdr');
  const [personName, setPersonName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Auto seed if query param `?seed=true`
  useEffect(() => {
    if (searchParams.get('seed') === 'true') {
      handleSeedDemo();
    }
  }, [searchParams]);

  const handleSeedDemo = async () => {
    setSeeding(true);
    setError('');
    setResult(null);
    try {
      const res = await uploadAPI.seedDemo(caseId);
      setResult({
        title: 'Syndicate Network Ingested Successfully',
        details: res.data,
      });
      if (onDataIngested) onDataIngested();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to seed syndicate dataset');
    } finally {
      setSeeding(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const res = await uploadAPI.upload(caseId, file, dataType, personName || null);
      setResult({
        title: 'Evidence Ingested Successfully',
        details: res.data,
      });
      setFile(null);
      if (onDataIngested) onDataIngested();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to parse and ingest file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '20px 16px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px', borderBottom: '2px solid var(--black)', paddingBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
          Data Ingestion & Evidence Parsers
        </h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Ingest multi-source law enforcement records into the relationship graph with automated NER and suspicion scoring
        </p>
      </div>

      {/* 1-Click Demo Ingestion Card */}
      <div
        style={{
          background: 'var(--yellow-light)',
          border: '2px solid var(--black)',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '28px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Instant Fictional Syndicate Loader (Recommended)
              </h3>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#333', maxWidth: '650px', lineHeight: 1.4 }}>
              Populates this case with the clean, focused <strong>7-person Cyber Syndicate</strong> (Vikram Malhotra Network)
              with multi-source evidence across FIRs, CDR calls, circular Hawala transactions, surveillance meetups, burner phones,
              and triggers all suspicious pattern detectors automatically.
            </p>
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSeedDemo}
            disabled={seeding}
          >
            {seeding ? 'Ingesting Syndicate...' : '⚡ Seed Clean Syndicate & Patterns'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {result && (
        <div className="alert alert-success" style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 800 }}>✓ {result.title}</h4>
          <div style={{ fontSize: '12px' }}>
            {result.details && typeof result.details === 'object' ? (
              <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                {result.details.persons_created != null && <span>Entities: <strong>{result.details.persons_created}</strong></span>}
                {result.details.edges_created != null && <span>Connections: <strong>{result.details.edges_created}</strong></span>}
                {result.details.records_parsed != null && <span>Records Parsed: <strong>{result.details.records_parsed}</strong></span>}
                {result.details.alerts_detected != null && <span>Alerts Detected: <strong>{result.details.alerts_detected}</strong></span>}
              </div>
            ) : null}
          </div>
          <button
            className="btn btn-sm btn-primary"
            style={{ marginTop: '12px' }}
            onClick={() => navigate(`/case/${caseId}/graph`)}
          >
            View Network Graph →
          </button>
        </div>
      )}

      {/* Category Evidence Overview Card */}
      <div style={{ background: '#FFFFFF', border: '1.5px solid var(--black)', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, textTransform: 'uppercase' }}>
          📁 Multi-Source Evidence Categories Included in Dataset
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>📄 First Information Reports (FIR)</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>3 official FIRs filed across BKC Mumbai, Delhi Special Cell, and CID Bengaluru for corporate spear-phishing and C2 ops.</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>📱 Call Detail Records (CDR)</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Call records with pre-heist communication burst (18 calls between Boss & Handler) and burner SIM linkages.</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>💸 Financial Hawala / Bank</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Circular money laundering cycle (₹12.5L Rohan ➔ Sameer ➔ Devendra ➔ Rohan) + anomalous ₹25L spike.</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>👁️ Surveillance Reports</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Field observations: Vikram Malhotra spotted handing encrypted device to Devendra Kumar at Grand Hyatt Mumbai.</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>💬 Social Media & Darknet</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Encrypted Telegram group #GARUDA_ALPHA coordination on invoice phishing and bulletproof TOR proxy hosting.</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>⚖️ Criminal History Database</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Shared case references and prior chargesheets connecting Vikram Malhotra with co-accused Pooja Nair.</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>📍 Location Pings (Cell Tower)</div>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Spatiotemporal GPS clusters tracking Vikram, Devendra, and Karan at identical coordinates during the meetup.</div>
          </div>
        </div>
      </div>

      {/* Manual File Upload Card */}
      <div style={{ background: '#FFFFFF', border: '1.5px solid var(--black)', borderRadius: '8px', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' }}>
          Manual Evidence Upload
        </h3>

        <form onSubmit={handleUpload}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Record Type *
              </label>
              <select
                className="form-input"
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="cdr">Call Detail Records (CDR CSV)</option>
                <option value="transactions">Financial Hawala / Bank Transactions (CSV)</option>
                <option value="fir">First Information Report (FIR Text / JSON)</option>
                <option value="surveillance">Field Surveillance Notes (JSON)</option>
                <option value="social_media">Social Media Intel (JSON)</option>
                <option value="criminal_history">Criminal History Records (JSON)</option>
                <option value="location_pings">Cell Tower Location Pings (CSV)</option>
                <option value="batch_json">Complete Case Batch File (JSON)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Associate with Known Person (Optional)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Vikram Malhotra"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Sample File Reference Helper */}
          <div
            style={{
              background: '#F1F5F9',
              border: '1px dashed #CBD5E1',
              borderRadius: '6px',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#334155',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '2px', color: '#0F172A' }}>
              💡 Ready-to-Upload Sample File:
            </div>
            <div>
              {dataType === 'cdr' && <span>📄 <code>data-generator/output/cdr_records.csv</code> (Call records with pre-heist burst)</span>}
              {dataType === 'transactions' && <span>📄 <code>data-generator/output/transaction_records.csv</code> (Hawala circular loop records)</span>}
              {dataType === 'fir' && <span>📄 <code>data-generator/output/fir_records.json</code> (3 FIR chargesheets across BKC, Delhi, Bengaluru)</span>}
              {dataType === 'surveillance' && <span>📄 <code>data-generator/output/surveillance_records.json</code> (Field observations at Grand Hyatt)</span>}
              {dataType === 'social_media' && <span>📄 <code>data-generator/output/social_media_records.json</code> (Telegram #GARUDA_ALPHA C2 logs)</span>}
              {dataType === 'criminal_history' && <span>📄 <code>data-generator/output/criminal_history_records.json</code> (Prior convictions & cross-case links)</span>}
              {dataType === 'location_pings' && <span>📄 <code>data-generator/output/location_pings.csv</code> (GPS cell tower cluster records)</span>}
              {dataType === 'batch_json' && <span>📄 <code>data-generator/output/complete_case_data.json</code> (Complete unified case syndicate)</span>}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Select File *
            </label>
            <input
              type="file"
              className="form-input"
              onChange={(e) => setFile(e.target.files[0])}
              required
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading}
            style={{ width: '100%' }}
          >
            {uploading ? 'Processing and Scoring Records...' : 'Upload & Parse Evidence'}
          </button>
        </form>
      </div>
    </div>
  );
}
