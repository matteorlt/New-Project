import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Paper,
  FormControlLabel,
  Switch,
  Alert,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import fr from 'date-fns/locale/fr';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { RootState } from '../store';
import {
  fetchEventsStart,
  fetchEventsSuccess,
  fetchEventsFailure,
  addEvent,
  updateEvent,
  deleteEvent,
} from '../store/slices/eventSlice';
import {
  fetchTasksStart,
  fetchTasksSuccess,
  fetchTasksFailure,
} from '../store/slices/taskSlice';
import { Event } from '../store/slices/eventSlice';
import { Task } from '../store/slices/taskSlice';
import { formatDate, formatDateForInput, formatDateForServer } from '../utils/dateUtils';

// Type commun pour les événements du calendrier
interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  type: 'event' | 'task';
  description: string;
  location?: string;
  participants?: string[];
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

const locales = {
  'fr': fr,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const EVENTS_URL = 'http://localhost:3000/api/events';

const CalendarPage: React.FC = () => {
  const dispatch = useDispatch();
  const { events, loading: eventsLoading } = useSelector((state: RootState) => state.events);
  const { tasks, loading: tasksLoading } = useSelector((state: RootState) => state.tasks);
  const { token } = useSelector((state: RootState) => state.auth);
  const [open, setOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    allDay: false,
    location: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch events
        dispatch(fetchEventsStart());
        const eventsResponse = await fetch(EVENTS_URL, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!eventsResponse.ok) {
          throw new Error('Erreur lors du chargement des événements');
        }
        const eventsData = await eventsResponse.json();
        dispatch(fetchEventsSuccess(eventsData));

        // Fetch tasks
        dispatch(fetchTasksStart());
        const tasksResponse = await fetch('http://localhost:3000/api/tasks', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!tasksResponse.ok) {
          throw new Error('Erreur lors du chargement des tâches');
        }
        const tasksData = await tasksResponse.json();
        dispatch(fetchTasksSuccess(tasksData));
      } catch (error) {
        dispatch(fetchEventsFailure('Erreur lors du chargement des données'));
        dispatch(fetchTasksFailure('Erreur lors du chargement des données'));
      }
    };

    if (token) {
      fetchData();
    }
  }, [dispatch, token]);

  // DEBUG : Affichage brut des events
  console.log('events (brut):', JSON.stringify(events, null, 2));

  // Convertir les tâches et événements en événements pour le calendrier
  const calendarEvents: CalendarEvent[] = [
    ...events
      .filter(event => (event.startDate || (event as any)['start_date']))
      .map(event => {
        const start = new Date(event.startDate || (event as any)['start_date']);
        const endRaw = new Date(event.endDate || (event as any)['end_date']);
        const end = new Date(endRaw);
        end.setDate(end.getDate() + 1); // Ajoute 1 jour pour l'affichage dans le calendrier
        return {
          id: `event-${event.id}`,
          title: `📅 ${event.title}`,
          startDate: start,
          endDate: end,
          allDay: true,
          type: 'event' as const,
          description: event.description,
          location: event.location,
          participants: event.participants
        };
      }),
    ...tasks.map(task => ({
      id: `task-${task.id}`,
      title: `📝 ${task.title}`,
      startDate: new Date(task.dueDate),
      endDate: new Date(task.dueDate),
      allDay: true,
      type: 'task' as const,
      description: task.description,
      status: task.status,
      priority: task.priority
    }))
  ];
  console.log('calendarEvents (détail):', JSON.stringify(calendarEvents, null, 2));
  // DEBUG : Affichage des données dans la console
  console.log('--- DEBUG CALENDRIER ---');
  console.log('events:', events);
  console.log('tasks:', tasks);
  console.log('calendarEvents:', calendarEvents);

  const handleOpen = (event?: CalendarEvent) => {
    if (event) {
      // Si c'est un événement (et pas une tâche), on retire 1 jour à la date de fin pour le formulaire
      let endDate = event.endDate;
      if (event.type === 'event') {
        const end = new Date(event.endDate);
        end.setDate(end.getDate() - 1);
        endDate = end;
      }
      setSelectedEvent(event);
      setFormData({
        title: event.title,
        description: event.description,
        startDate: formatDateForInput(event.startDate),
        endDate: formatDateForInput(endDate),
        allDay: event.allDay,
        location: event.location || '',
      });
    } else {
      setSelectedEvent(null);
      setFormData({
        title: '',
        description: '',
        startDate: '',
        endDate: '',
        allDay: false,
        location: '',
      });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedEvent(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Le titre est requis');
      return;
    }

    if (!formData.startDate || !formData.endDate) {
      setError('Les dates de début et de fin sont requises');
      return;
    }

    // S'assurer que la date de fin est après la date de début
    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);
    if (endDate < startDate) {
      setError('La date de fin doit être après la date de début');
      return;
    }

    const eventData = {
      ...formData,
      startDate: formatDateForServer(formData.startDate),
      endDate: formatDateForServer(formData.endDate),
    };

    try {
      if (selectedEvent && selectedEvent.type === 'event') {
        const response = await fetch(`${EVENTS_URL}/${selectedEvent.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(eventData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Erreur lors de la modification de l\'événement');
        }

        const data = await response.json();
        dispatch(updateEvent(data));
      } else {
        const response = await fetch(EVENTS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(eventData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Erreur lors de la création de l\'événement');
        }

        const data = await response.json();
        dispatch(addEvent(data));
      }
      handleClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'événement:', error);
      setError(error instanceof Error ? error.message : 'Une erreur est survenue');
    }
  };

  const handleSelect = ({ start, end }: { start: Date; end: Date }) => {
    setFormData({
      ...formData,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    });
    handleOpen();
  };

  const handleEventClick = (calendarEvent: CalendarEvent) => {
    if (calendarEvent.type === 'task') {
      navigate('/tasks');
    } else {
      handleOpen(calendarEvent);
    }
  };

  return (
    <Box>
      {/* Message d'erreur si aucun événement ni tâche */}
      {calendarEvents.length === 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Aucun événement ou tâche à afficher dans le calendrier (mode debug).<br />
          Vérifiez la console pour plus d'informations.
        </Alert>
      )}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Calendrier</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
        >
          Nouvel événement
        </Button>
      </Box>

      <Paper sx={{ p: 2 }}>
        <Calendar<CalendarEvent>
          localizer={localizer}
          events={calendarEvents}
          startAccessor="startDate"
          endAccessor="endDate"
          style={{ height: 600 }}
          onSelectSlot={handleSelect}
          onSelectEvent={handleEventClick}
          selectable
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: event.type === 'task' ? '#f50057' : '#4caf50',
              borderRadius: '4px',
              opacity: 0.8,
              color: 'white',
              border: '0px',
              display: 'block',
              padding: '2px 4px',
              fontSize: event.type === 'task' ? '0.875rem' : '0.75rem',
              fontWeight: event.type === 'task' ? 'normal' : 'bold',
              textAlign: event.type === 'task' ? 'left' : 'center',
              textTransform: event.type === 'task' ? 'none' : 'uppercase',
              boxShadow: event.type === 'task' ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
              margin: event.type === 'task' ? '0' : '2px 0',
              height: event.type === 'task' ? 'auto' : '24px',
              lineHeight: event.type === 'task' ? 'normal' : '24px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }
          })}
          messages={{
            next: "Suivant",
            previous: "Précédent",
            today: "Aujourd'hui",
            month: "Mois",
            week: "Semaine",
            day: "Jour",
            agenda: "Agenda",
            date: "Date",
            time: "Heure",
            event: "Événement",
            noEventsInRange: "Aucun événement dans cette période",
          }}
        />
      </Paper>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedEvent ? 'Modifier l\'événement' : 'Nouvel événement'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            {error && (
              <Typography color="error" sx={{ mb: 2 }}>
                {error}
              </Typography>
            )}
            <TextField
              fullWidth
              label="Titre"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              margin="normal"
              required
              error={!!error && !formData.title}
            />
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              margin="normal"
              multiline
              rows={3}
            />
            <TextField
              fullWidth
              label="Date de début"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              margin="normal"
              InputLabelProps={{ shrink: true }}
              required
              error={!!error && !formData.startDate}
            />
            <TextField
              fullWidth
              label="Date de fin"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value})}
              margin="normal"
              InputLabelProps={{ shrink: true }}
              required
              error={!!error && !formData.endDate}
            />
            <TextField
              fullWidth
              label="Lieu"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Annuler</Button>
            <Button type="submit" variant="contained">
              {selectedEvent ? 'Modifier' : 'Créer'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default CalendarPage; 