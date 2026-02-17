// src/pages/Instructors.jsx
import { useState } from 'react';
import { Button, Card, Tag, Space, Avatar } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { PlusOutlined, UserOutlined, EditOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import { useAuth } from "@/shared/hooks/useAuth";
import { useData } from '@/shared/hooks/useData';
import EnhancedInstructorDetailModal from '../components/EnhancedInstructorDetailModal';

const InstructorMobileCard = ({ record, onAction, isAdmin }) => (
  <Card size="small" className="mb-2">
    <div className="flex justify-between items-start mb-2">
       <Space>
         <Avatar icon={<UserOutlined />} size="small" src={record.avatar_url} /> 
         <div>
            <div className="font-medium">{record.name}</div>
            <div className="text-xs text-gray-500">{record.email}</div>
         </div>
       </Space>
       <Tag color={record.status === 'active' ? 'green' : 'default'}>
          {record.status || 'active'}
       </Tag>
    </div>
    <div className="mb-2">
      <div className="text-xs text-gray-500">Specializations:</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {(record.specializations || []).map(s => (
          <Tag key={s} bordered={false} className="mr-0">{s}</Tag>
        ))}
        {(!record.specializations || record.specializations.length === 0) && <span className="text-gray-400 text-xs">—</span>}
      </div>
    </div>
    <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button size="small" icon={<EyeOutlined />} onClick={() => onAction('open', record)}>Open</Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => onAction('edit', record)}>Edit</Button>
        {isAdmin && (
           <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onAction('delete', record)}>Delete</Button>
        )}
    </div>
  </Card>
);

function Instructors() {
  const { user } = useAuth();
  const { instructors, loading, error, deleteInstructor } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSpecialization, setFilterSpecialization] = useState('all');
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Check if user has administrator permissions
  const isAdmin = user && ['manager', 'admin'].includes(user.role);
  
  // Get all unique specializations for filter dropdown
  const allSpecializations = [...new Set(
    instructors.flatMap(instructor => instructor.specializations || [])
  )].sort();
  
  // Apply filters and search
  const filteredInstructors = instructors.filter(instructor => {
    // Apply status filter
    if (filterStatus !== 'all' && instructor.status !== filterStatus) {
      return false;
    }
    
    // Apply specialization filter
    if (filterSpecialization !== 'all' && 
        !(instructor.specializations || []).includes(filterSpecialization)) {
      return false;
    }
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        instructor.name.toLowerCase().includes(query) ||
        instructor.email.toLowerCase().includes(query) ||
        (instructor.specializations || []).some(spec => 
          spec.toLowerCase().includes(query)
        )
      );
    }
    
    return true;
  });
  
  const handleDeleteInstructor = async (instructorId) => {
    if (window.confirm('Are you sure you want to delete this instructor?')) {
      try {
        await deleteInstructor(instructorId);
  } catch {
        message.error('Failed to delete instructor');
      }
    }
  };
  
  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 max-w-7xl mx-auto">
      <Card
        variant="borderless"
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-sm"
        styles={{ body: { padding: '16px' } }}
        classNames={{ body: 'sm:!p-8' }}
      >
        <div className="pointer-events-none absolute -top-20 right-8 h-44 w-44 rounded-full bg-blue-100" />
        <div className="pointer-events-none absolute -bottom-24 left-16 h-48 w-48 rounded-full bg-sky-50" />
        <div className="relative space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
            <div className="space-y-1 sm:space-y-2 max-w-2xl">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">Instructors</h1>
              <p className="text-slate-600 text-sm sm:text-base">
                Manage your team of instructors. Track their specializations, status, and performance.
              </p>
            </div>
            {isAdmin && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => (window.location.href = '/instructors/new')}
                size="middle"
                className="w-full sm:w-auto shrink-0"
              >
                <span className="hidden sm:inline">Add Instructor</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}
          </div>
        </div>
      </Card>
      
      {/* Filters */}
      <Card className="rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search by name, email, specialization..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Specialization</label>
            <select
              value={filterSpecialization}
              onChange={(e) => setFilterSpecialization(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Specializations</option>
              {allSpecializations.map(spec => (
                <option key={spec} value={spec}>{spec}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>
      
      {loading ? (
        <div className="text-center py-8">
          <div className="spinner" />
          <p className="mt-2 text-gray-600">Loading instructors...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
          <button className="text-red-700 underline mt-2" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : filteredInstructors.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No instructors found</p>
        </div>
      ) : (
        <UnifiedResponsiveTable 
          title="Instructors" 
          density="comfortable"
          dataSource={filteredInstructors}
          rowKey="id"
          mobileCardRenderer={(props) => (
             <InstructorMobileCard 
                {...props} 
                isAdmin={isAdmin}
                onAction={(action, record) => {
                   if (action === 'open') {
                      setSelectedInstructor(record);
                      setIsDetailOpen(true);
                   } else if (action === 'edit') {
                      window.location.href = `/instructors/edit/${record.id}`;
                   } else if (action === 'delete') {
                      handleDeleteInstructor(record.id);
                   }
                }} 
             />
          )}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name', fixed: 'left', render: (text) => <span className="font-medium">{text}</span> },
            { title: 'Email', dataIndex: 'email', key: 'email' },
            { title: 'Specializations', dataIndex: 'specializations', key: 'specializations', render: (val) => (val || []).join(', ') || '—' },
            { title: 'Status', dataIndex: 'status', key: 'status', render: (val) => <Tag color={val === 'active' ? 'green' : 'default'} className="capitalize">{val || 'active'}</Tag> },
            { 
               title: 'Actions', 
               key: 'actions', 
               render: (_, instructor) => (
                  <div className="flex gap-2">
                    <Button
                      size="small"
                      onClick={() => {
                        setSelectedInstructor(instructor);
                        setIsDetailOpen(true);
                      }}
                    >
                      Open
                    </Button>
                    <Button size="small" onClick={() => (window.location.href = `/instructors/edit/${instructor.id}`)}>
                      Edit
                    </Button>
                    {isAdmin && (
                      <Button size="small" danger onClick={() => handleDeleteInstructor(instructor.id)}>Delete</Button>
                    )}
                  </div>
               )
            }
          ]}
        />
      )}
      

      {/* Detail modal with commissions, payroll, and earnings */}
      <EnhancedInstructorDetailModal
        instructor={selectedInstructor}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onUpdate={() => { /* no-op for now; list is fed by context */ }}
      />

    </div>
  );
}

export default Instructors;