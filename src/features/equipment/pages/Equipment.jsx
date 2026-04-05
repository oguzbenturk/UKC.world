// src/pages/Equipment.jsx
import React, { useState, useEffect } from 'react';
import { Button, Space, Card } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { useData } from '@/shared/hooks/useData';
import EquipmentList from '../components/EquipmentList';
import EquipmentDetail from '../components/EquipmentDetail';
import EquipmentForm from '../components/EquipmentForm';

function Equipment() {
  const { user } = useAuth();
  const { equipment, loading, error, refreshData } = useData();
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [view, setView] = useState('list'); // list, detail, form

  // Add console logging to validate real data loading
  useEffect(() => {
    if (equipment?.length > 0) {
      console.log('Equipment data loaded from API:', { count: equipment.length, equipment });
    }
  }, [equipment]);

  // Determine if user is a manager, owner, or admin
  const isManagerOrOwner = user && (user.role === 'manager' || user.role === 'owner' || user.role === 'admin');

  // Handle equipment selection
  const handleEquipmentSelect = (equipmentId) => {
    const found = equipment.find(item => item.id === equipmentId);
    if (found) {
      setSelectedEquipment(found);
      setView('detail');
    }
  };

  // Handle add equipment click
  const handleAddEquipment = () => {
    setSelectedEquipment(null);
    setShowAddEquipment(true);
    setView('form');
  };

  // Handle edit equipment click
  const handleEditEquipment = (equipmentId) => {
    const found = equipment.find(item => item.id === equipmentId);
    if (found) {
      setSelectedEquipment(found);
      setShowAddEquipment(false);
      setView('form');
    }
  };

  // Handle form cancel
  const handleFormCancel = () => {
    setView('list');
  };

  // Handle form submit
  const handleFormSubmit = (equipmentData) => {
    // Form submission logic handled by the form component
    setView('list');
  };

  // Handle back to list
  const handleBackToList = () => {
    setView('list');
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {view === 'list' && (
        <Card
          variant="borderless"
          className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          styles={{ body: { padding: 32 } }}
        >
          <div className="pointer-events-none absolute -top-20 right-8 h-44 w-44 rounded-full bg-emerald-100" />
          <div className="pointer-events-none absolute -bottom-24 left-16 h-48 w-48 rounded-full bg-teal-50" />
          <div className="relative space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2 max-w-2xl">
                <h1 className="text-3xl font-bold text-slate-900">Equipment & Gear</h1>
                <p className="text-slate-600 text-base">
                  Track and manage all equipment inventory. Monitor availability, condition, and maintenance schedules.
                </p>
              </div>
              <Space>
                <Button 
                  icon={<ReloadOutlined />}
                  onClick={refreshData}
                  loading={loading}
                  size="large"
                >
                  Refresh
                </Button>
                {isManagerOrOwner && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddEquipment}
                    size="large"
                  >
                    Add Equipment
                  </Button>
                )}
              </Space>
            </div>
          </div>
        </Card>
      )}
      
      {view !== 'list' && (
        <div className="flex items-center gap-4 mb-6">
          <Button
            onClick={handleBackToList}
            size="large"
          >
            ← Back to List
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="spinner" />
          <p className="mt-2 text-gray-600">Loading equipment data...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
          <button className="text-red-700 underline mt-2" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {view === 'list' && (
            <EquipmentList 
              equipment={equipment}
              onEquipmentSelect={handleEquipmentSelect}
              onEditEquipment={isManagerOrOwner ? handleEditEquipment : null}
            />
          )}

          {view === 'detail' && selectedEquipment && (
            <EquipmentDetail 
              equipment={selectedEquipment}
              onEdit={isManagerOrOwner ? handleEditEquipment : null}
              onBack={handleBackToList}
            />
          )}

          {view === 'form' && (
            <EquipmentForm 
              equipment={selectedEquipment}
              isNew={showAddEquipment}
              onSubmit={handleFormSubmit}
              onCancel={handleFormCancel}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Equipment;