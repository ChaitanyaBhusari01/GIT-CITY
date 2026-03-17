import React from 'react';
import { Html } from '@react-three/drei';
import { FileCode, User, GitCommit, HardDrive, Folder } from 'lucide-react';

const CityTooltip = ({ fileData, position }) => {
    if (!fileData) return null;

    const fileName = fileData.path.split('/').pop();
    const folderParts = fileData.path.split('/');
    folderParts.pop();
    const folderName = folderParts.join('/') || 'Root';
    const sizeKB = (fileData.size / 1024).toFixed(1);

    return (
        <Html position={position} center distanceFactor={15} zIndexRange={[100, 0]}>
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl text-slate-300 text-sm min-w-[220px] pointer-events-none transform transition-all duration-200">
                <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2 mb-2">
                    <FileCode size={16} className="text-blue-400" />
                    <strong className="text-white truncate max-w-[180px]">{fileName}</strong>
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <Folder size={14} className="text-slate-500" />
                        <span className="truncate max-w-[180px]">{folderName}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <HardDrive size={14} className="text-emerald-400" />
                        <span>{sizeKB} KB lines/size</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <GitCommit size={14} className="text-purple-400" />
                        <span>{fileData.commitCount} commits</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <User size={14} className="text-amber-400" />
                        <span className="truncate max-w-[160px] text-amber-100">
                            {fileData.topContributor}
                        </span>
                    </div>
                </div>
            </div>
        </Html>
    );
};

export default CityTooltip;
