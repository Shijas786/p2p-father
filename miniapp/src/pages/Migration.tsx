import { useNavigate } from 'react-router-dom';
import './Migration.css';
import './Migration.css';

export function Migration() {
    const navigate = useNavigate();

    return (
        <div className="page migration-page animate-in">
            <div className="flex items-center mb-6">
                <button className="btn-back mr-4" onClick={() => navigate(-1)}>←</button>
                <h2 className="m-0">Legacy Migration</h2>
            </div>

            <div className="migration-banner-full">
                <div className="icon">🛡️</div>
                <div className="content">
                    <div className="migration-title">Safety First</div>
                    <div className="migration-desc">
                        We've upgraded our smart contracts to support BNB and native assets.
                        Your existing funds are safe in the older contracts, but needs to be moved to the new one to be used in ads.
                    </div>
                </div>
            </div>

            <div className="card text-center py-8">
                <div className="text-4xl mb-4">✅</div>
                <h3>No Legacy Funds Found</h3>
                <p className="text-muted">You're all set! All your funds are in the latest system.</p>
                <button className="btn btn-primary mt-4" onClick={() => navigate('/wallet')}>
                    Go to Wallet
                </button>
            </div>
        </div>
    );
}
