import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/appointments';

export default function App() {
  const [appointments, setAppointments] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [alert, setAlert] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    start_time: '',
    end_time: ''
  });

  const showAlert = (message, type = 'success') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const fetchAppointments = async () => {
    try {
      const params = new URLSearchParams();
      if (filterDate) params.append('date', filterDate);
      if (filterStatus !== 'All') params.append('status', filterStatus);

      const res = await fetch(`${API_BASE}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAppointments(data);
    } catch {
      showAlert('Could not load appointments from the backend.', 'error');
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [filterDate, filterStatus]);

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ title: '', description: '', date: '', start_time: '', end_time: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      description: item.description,
      date: item.date,
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5)
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.start_time >= formData.end_time) {
      showAlert('End time must be strictly after start time.', 'error');
      return;
    }

    // Format times into HH:MM:SS for Python/FastAPI schema compatibility
    const payload = {
      ...formData,
      start_time: formData.start_time.length === 5 ? `${formData.start_time}:00` : formData.start_time,
      end_time: formData.end_time.length === 5 ? `${formData.end_time}:00` : formData.end_time
    };

    try {
      const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert(data.detail || 'Request failed.', 'error');
        return;
      }

      showAlert(editingId ? 'Appointment updated!' : 'Appointment added!');
      setIsModalOpen(false);
      fetchAppointments();
    } catch {
      showAlert('Server communication error.', 'error');
    }
  };

  const handleStatusTransition = async (id, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert(data.detail || 'Could not update status.', 'error');
        return;
      }

      showAlert(`Appointment marked as ${newStatus}.`);
      fetchAppointments();
    } catch {
      showAlert('Server communication error.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="max-w-6xl mx-auto">
        {/* Flash Notifications */}
        {alert && (
          <div className={`mb-6 p-4 rounded-lg shadow-sm border text-sm font-medium ${
            alert.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {alert.message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-300 mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team Appointment Board</h1>
            <p className="text-slate-500 text-sm">FastAPI & React Appointment Scheduler</p>
          </div>
          <button
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition-colors text-sm"
          >
            + Add Appointment
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center mb-6">
          <div className="flex flex-col text-xs font-semibold text-slate-600 gap-1">
            <span>Filter by Date</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm font-normal focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="flex flex-col text-xs font-semibold text-slate-600 gap-1">
            <span>Filter by Status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm font-normal focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {(filterDate || filterStatus !== 'All') && (
            <button
              onClick={() => { setFilterDate(''); setFilterStatus('All'); }}
              className="mt-4 text-xs text-indigo-600 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Appointments Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {appointments.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-lg border border-slate-200 text-slate-500 text-sm">
              No appointments found matching your criteria.
            </div>
          ) : (
            appointments.map((item) => (
              <div
                key={item.id}
                className={`p-5 rounded-lg border flex flex-col justify-between transition shadow-sm ${
                  item.status === 'Cancelled' ? 'bg-slate-50 opacity-60 border-slate-200' : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <h2 className="font-semibold text-base text-slate-900 leading-tight">{item.title}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                      item.status === 'Cancelled' ? 'bg-rose-100 text-rose-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 font-medium mb-3">
                    📅 {item.date} &nbsp;•&nbsp; 🕒 {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                  </p>

                  <p className="text-sm text-slate-600 line-clamp-3">
                    {item.description || <span className="italic text-slate-400">No description provided</span>}
                  </p>
                </div>

                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
                  {item.status === 'Scheduled' ? (
                    <>
                      <button
                        onClick={() => openEditModal(item)}
                        className="text-xs font-semibold text-slate-700 hover:text-indigo-600 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStatusTransition(item.id, 'Completed')}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleStatusTransition(item.id, 'Cancelled')}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No further actions permitted</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Form Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
              <h2 className="text-lg font-bold mb-4 text-slate-900">
                {editingId ? 'Edit Appointment' : 'Add New Appointment'}
              </h2>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 outline-none focus:border-indigo-500"
                    placeholder="e.g., Sprint Planning"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    rows="2"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 outline-none focus:border-indigo-500"
                    placeholder="Agenda or context..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">End Time *</label>
                    <input
                      type="time"
                      required
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}