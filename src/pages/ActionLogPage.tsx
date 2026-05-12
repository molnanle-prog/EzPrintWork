import React, { useState, useEffect } from 'react';
import { db } from '../services/dataService';

interface ActionLog {
    id: number;
    timestamp: string;
    userName: string;
    machineId: string;
    actionType: string;
    details: string;
}

export const ActionLogPage = () => {
    const [logs, setLogs] = useState<ActionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            const result = await db.getActionLogs();
            if (result.success && Array.isArray(result.data)) {
                setLogs(result.data);
            } else {
                setError('작업 기록을 불러오는데 실패했습니다.');
                console.error(result.error);
            }
            setLoading(false);
        };

        fetchLogs();
    }, []);

    if (loading) {
        return <div className="p-4">로딩 중...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-500">{error}</div>;
    }

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">작업 기록</h1>
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시간</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">사용자</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업 종류</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업 내용</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기기 ID</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{log.userName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.actionType}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.details}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{log.machineId}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {logs.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        작업 기록이 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};
