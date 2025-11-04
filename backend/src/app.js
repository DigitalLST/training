require('dotenv').config();
const express = require('express');
const morgan  = require('morgan');
const cors    = require('cors');
const mongoose = require('mongoose');
const AuthRouter=require('./routes/auth');
const ContactRouter=require('./routes/contact');
const usersRoutes = require('./routes/user');
const sessionRoutes = require('./routes/session');
const centreRoutes = require('./routes/centre');
const critereRoutes = require('./routes/critere');
const DemandeParticipationRoutes = require('./routes/demande');
const app = express();
const PORT = process.env.PORT || 4000;
/*app.listen(PORT, () => console.log('API listening on', PORT));*/
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/api/contact',ContactRouter );
app.use('/api/sessions',sessionRoutes );
app.use('/api/centres',centreRoutes );
app.use('/api/auth',AuthRouter );
app.use('/api/users', usersRoutes);
app.use('/api/criteres', critereRoutes);
app.use('/api/demandes', DemandeParticipationRoutes);
app.set('etag', false); 
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

async function start() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scouts_training';
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { autoIndex: true });
    console.log('✅ Mongo connected');

    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`🚀 API running on :${port}`));
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}
start();
