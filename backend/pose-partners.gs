/** POSE Partners | Standalone Google Apps Script Web App.
 * Deploy independently from the inquiry backend. See PARTNERS-SETUP.md.
 * Execute as owner; access Anyone. Only admin email can mutate protected records.
 */
const PARTNER_VERSION='1.7.0';
const PARTNER_SHEETS={notifications:['Notification ID','Created At','Affiliate ID','Type','Title','Message','Reference','Read At'],inquiries:['Submission ID','Received','Affiliate ID','Affiliate Code','Service','Package','Event Date','Status','Linked Booking ID','Last Sync'],affiliates:['ID','Registered','Name','Email','Phone','City','Type','Facebook','Status','Code','Payment Method','Payment Name','Payment Number','QR File ID'],payouts:['Payout ID','Created','Affiliate ID','Amount','Status','Method','Account Name','Account Number','Reference','Paid At','Processed By','Booking IDs','Receipt File ID'],bookings:['Booking ID','Recorded','Affiliate ID','Affiliate Code','Package Key','Event Date','Status','Paid Amount','Paid At','Base Commission'],audit:['Timestamp','Actor','Action','Reference','Detail']};
// New commission rates apply only to NEW service bookings. Historical rows without
// a Base Commission snapshot retain their previous commission schedule.
const BASE_RATES={classic:150,signature:250,photoman:250,studio:400,ai:500,tradingcard:500,booth360:600};
const LEGACY_BASE_RATES={classic4r:100,classicstrip:150,signature:200,photoman:200,photography:100,studio:300,booth360:500,photoBundle:200,bundle360:600};
const BASE_NAMES={classic:'Classic Photobooth',signature:'Signature Photobooth',photoman:'Photoman',studio:'On-site Photo Studio',ai:'AI Photobooth',tradingcard:'Trading Card Photobooth',booth360:'360 Video Booth',classic4r:'Classic 4R (legacy)',classicstrip:'Classic Strip (legacy)',photography:'Event Photography (legacy)',photoBundle:'Photobooth + Photographer (legacy)',bundle360:'360 + Classic (legacy)'};
function partnerBaseCommission_(booking){
 const snap=booking['Base Commission'];
 if(snap!==''&&snap!==null&&snap!==undefined&&Number.isFinite(Number(snap)))return Number(snap);
 return LEGACY_BASE_RATES[booking['Package Key']]||0;
}
function partnerInquiryIdForBooking_(bookingId){return String(bookingId||'').replace(/__SVC_[A-Za-z0-9]+$/,'');}
function setupPartners(){
 const props=PropertiesService.getScriptProperties();
 if(!props.getProperty('PARTNERS_ADMIN_EMAIL')) throw Error('Set PARTNERS_ADMIN_EMAIL in Script Properties before setup.');
 partnerDb_(); return 'POSE Partners initialized';
}
function doGet(){return partnerJson_({ok:true,service:'POSE Partners',version:PARTNER_VERSION});}
function doPost(e){
 let p=(e&&e.parameter)||{};
 try {
  if(String(p.website||'').trim()) return partnerJson_({ok:true});
  let action=partnerClean_(p.action,32);
  // Writes are serialized to avoid duplicate claims / payout races.
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try {return partnerJson_(Object.assign({ok:true},partnerAction_(action,p)));}
  finally{lock.releaseLock();}
 }catch(ex){console.error(ex);return partnerJson_({ok:false,error:String(ex.message||ex)});}
}
function partnerAction_(action,p){
 if(action==='register')return partnerRegister_(p);
 if(action==='requestCode')return partnerRequestCode_(p);
 if(action==='verifyCode')return partnerVerifyCode_(p);
 // Dedicated backend-to-backend route authenticates with PARTNERS_SYNC_SECRET.
 // It must never be treated as an affiliate browser session.
 if(action==='syncInquiry')return partnerSyncInquiry_(p);
 const auth=partnerAuth_(p.token);
 if(action==='dashboard')return partnerDashboard_(auth);
 if(action==='markNotificationRead')return partnerMarkNotificationRead_(auth,p);
 if(['getPaymentQr','getPayoutReceipt','updatePayment','requestPayout'].includes(action)){
  if(action==='getPaymentQr')return partnerGetQr_(auth,p);
  if(action==='getPayoutReceipt')return partnerGetPayoutReceipt_(auth,p);
  if(action==='updatePayment')return partnerUpdatePayment_(auth,p);
  return partnerRequestPayout_(auth,p);
 }
 partnerAdmin_(auth);
 if(action==='adminData')return partnerAdminData_();
 if(action==='sendAnnouncement')return partnerSendAnnouncement_(auth,p);
 if(action==='setAffiliate')return partnerSetAffiliate_(auth,p);
 if(action==='setInquiry')return partnerSetInquiry_(auth,p);
 if(action==='recordBooking')return partnerRecordBooking_(auth,p);
 if(action==='setBooking')return partnerSetBooking_(auth,p);
 if(action==='getPaymentQr')return partnerGetQr_(auth,p);
 if(action==='getPayoutReceipt')return partnerGetPayoutReceipt_(auth,p);
 if(action==='updatePayment')return partnerUpdatePayment_(auth,p);
 if(action==='requestPayout')return partnerRequestPayout_(auth,p);
 if(action==='confirmPayout')return partnerConfirmPayout_(auth,p);
 if(action==='payBooking')throw Error('Use payout requests and transaction references instead.');
 throw Error('Unknown action');
}
function partnerProps_(){return PropertiesService.getScriptProperties();}
function partnerAdminEmail_(){return String(partnerProps_().getProperty('PARTNERS_ADMIN_EMAIL')||'').trim().toLowerCase();}
function partnerDb_(){const prop=partnerProps_();let id=prop.getProperty('PARTNERS_DB_ID'),db;
 if(id){db=SpreadsheetApp.openById(id);}else{db=SpreadsheetApp.create('POSE Partners - Affiliate Registry');prop.setProperty('PARTNERS_DB_ID',db.getId());}
 Object.keys(PARTNER_SHEETS).forEach(k=>{let sheet=db.getSheetByName(k);if(!sheet){sheet=db.insertSheet(k);sheet.appendRow(PARTNER_SHEETS[k]);sheet.setFrozenRows(1);}else{const current=sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getValues()[0];PARTNER_SHEETS[k].forEach((heading,i)=>{if(!current[i])sheet.getRange(1,i+1).setValue(heading);else if(current[i]!==heading)throw Error('Unexpected schema in '+k+' column '+(i+1));});}});
 return db;
}
function partnerSheet_(name){return partnerDb_().getSheetByName(name);}
function partnerRows_(name){let s=partnerSheet_(name),v=s.getDataRange().getValues(),keys=PARTNER_SHEETS[name];return v.slice(1).filter(x=>x.some(y=>y!=='')) .map((r,i)=>Object.fromEntries(keys.map((k,j)=>[k,r[j] instanceof Date?Utilities.formatDate(r[j],Session.getScriptTimeZone(),'yyyy-MM-dd'):r[j]]).concat([['_row',i+2]])));}
function partnerClean_(s,n){return String(s==null?'':s).trim().slice(0,n).replace(/[<>]/g,'');}
function partnerEmail_(s){let email=partnerClean_(s,180).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address.');return email;}
function partnerUuid_(){return Utilities.getUuid().replace(/-/g,'').toUpperCase();}
function partnerHash_(s){let digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8);return Utilities.base64EncodeWebSafe(digest);}
function partnerSafe_(s){return "'"+String(s).replace(/^[=+@-]/,'');}
function partnerRegister_(p){
 if(p.consent!=='yes')throw Error('Accept the terms and privacy notice.');
 let name=partnerClean_(p.name,120),email=partnerEmail_(p.email),phone=partnerClean_(p.phone,40),city=partnerClean_(p.city,100),type=partnerClean_(p.type,80),facebook=partnerClean_(p.facebook,200);
 const payment=partnerPaymentFields_(p);
 if(!name||!phone||!city||!type)throw Error('Please complete all required fields.');
 const types=['Individual Referrer','Event Coordinator / Planner','Photographer / Videographer','Event Supplier','Content Creator','Venue / Events Place','Other'];
 if(!types.includes(type))throw Error('Invalid partner type.');
 if(partnerRows_('affiliates').some(x=>String(x.Email).toLowerCase()===email))throw Error('This email already has an application. Sign in to check its status.');
 let id,code,known=partnerRows_('affiliates');do{id='AF-'+partnerUuid_().slice(0,10);}while(known.some(x=>x.ID===id));do{code='POSE'+partnerUuid_().slice(0,8);}while(known.some(x=>x.Code===code));
 const qrId=partnerSaveQr_(p.qrData,id);
 partnerSheet_('affiliates').appendRow([id,new Date(),partnerSafe_(name),email,partnerSafe_(phone),partnerSafe_(city),type,partnerSafe_(facebook),'Pending',code,payment.method,partnerSafe_(payment.name),partnerSafe_(payment.number),qrId]);
 partnerAudit_('public','register',id,'Application received');
 const admin=partnerAdminEmail_();if(admin)MailApp.sendEmail(admin,'POSE Partners: new application',`New affiliate application from ${name} (${email}). Review in POSE Partners admin dashboard.`);
 return {message:'Application received. POSE will review your registration.'};
}
function partnerRequestCode_(p){
 const email=partnerEmail_(p.email),admin=email===partnerAdminEmail_();
 const applicant=partnerRows_('affiliates').find(r=>String(r.Email).toLowerCase()===email);
 // Always generic reply for unregistered accounts to prevent account enumeration.
 if(!admin&&!applicant)return {message:'If the email is registered, a sign-in code will be sent.'};
 const cache=CacheService.getScriptCache();const rateKey='otp-rate-'+partnerHash_(email);
 if(cache.get(rateKey))throw Error('A code was recently sent. Please try again in 60 seconds.');
 let otp=String(Math.floor(100000+Math.random()*900000)),salt=partnerUuid_(),key=partnerHash_(email);
 cache.put('otp-'+key,JSON.stringify({hash:partnerHash_(salt+otp),salt,attempts:0}),600);
 cache.put(rateKey,'1',60);
 MailApp.sendEmail(email,'POSE Partners: your sign-in code',`Your POSE Partners sign-in code is ${otp}. It expires in 10 minutes. Do not share this code.`);
 return {message:'If the email is registered, a sign-in code will be sent.'};
}
function partnerVerifyCode_(p){
 const email=partnerEmail_(p.email),otp=partnerClean_(p.code,6);
 if(!/^\d{6}$/.test(otp))throw Error('Enter the 6-digit code.');
 const cache=CacheService.getScriptCache(),key='otp-'+partnerHash_(email),raw=cache.get(key);
 if(!raw)throw Error('Code expired or invalid. Request a new code.');
 const entry=JSON.parse(raw);
 if(entry.attempts>=5){cache.remove(key);throw Error('Too many attempts. Request a new code.');}
 if(partnerHash_(entry.salt+otp)!==entry.hash){entry.attempts++;cache.put(key,JSON.stringify(entry),600);throw Error('Incorrect code.');}
 cache.remove(key);
 const admin=email===partnerAdminEmail_(),affiliate=partnerRows_('affiliates').find(x=>String(x.Email).toLowerCase()===email);
 if(!admin&&!affiliate)throw Error('Account not found.');
 const token=partnerUuid_()+partnerUuid_(),sessionKey='session-'+partnerHash_(token);
 cache.put(sessionKey,JSON.stringify({email,admin,id:affiliate?affiliate.ID:''}),21600);
 return {token,admin,expiresIn:21600};
}
function partnerAuth_(token){let t=partnerClean_(token,100);if(!/^[0-9A-F]{64}$/.test(t))throw Error('Please sign in.');
 let raw=CacheService.getScriptCache().get('session-'+partnerHash_(t));if(!raw)throw Error('Session expired. Sign in again.');return JSON.parse(raw);
}
function partnerAdmin_(auth){if(!auth.admin||auth.email!==partnerAdminEmail_())throw Error('Administrator access required.');}
function partnerAudit_(who,what,ref,detail){partnerSheet_('audit').appendRow([new Date(),who,what,ref,detail]);}
/** v1.4 partner-facing notifications. Email errors never change a saved inquiry/booking. */
function partnerNotify_(affiliate,kind,reference,details){
 const enabled=String(partnerProps_().getProperty('PARTNERS_EMAIL_NOTIFICATIONS')||'true').toLowerCase();
 if(enabled==='false')return;
 if(!affiliate||affiliate.Status!=='Approved')return;
 const email=String(affiliate.Email||'').trim().toLowerCase(),ref=partnerClean_(reference,120),service=partnerClean_(details.service||'',120),date=partnerClean_(details.eventDate||'',40);
 const dashboard='https://poseph.com/partners/dashboard.html';
 let subject,body;
 if(kind==='inquiry'){
  subject='POSE Partners: new referred inquiry '+ref;
  body='A new inquiry was attributed to your POSE Partners account.\n\nInquiry ID: '+ref+'\nService: '+service+'\nEvent date: '+date+'\nStatus: New Inquiry\n\nView your referrals: '+dashboard+'\n\nAn inquiry is not a confirmed booking and earns no commission until verified.';
 }else if(kind==='confirmed'){
  subject='POSE Partners: referral booking confirmed '+ref;
  body='POSE has recorded a confirmed booking for your referral.\n\nBooking ID: '+ref+'\nService: '+service+'\nEvent date: '+date+'\nStatus: Confirmed Booking\n\nView your booking status: '+dashboard+'\n\nCommission becomes eligible only after the event is completed and fully paid.';
 }else return;
 try{
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Invalid affiliate email');
  MailApp.sendEmail({to:email,subject:subject,body:body,name:'POSE Partners'});
  partnerAudit_('notification','email_sent',ref,kind+' to '+email);
 }catch(err){
  console.error('POSE notification failed: '+String(err));
  // The business record has already been committed. Log a separate failure for manual retry.
  try{partnerAudit_('notification','email_failed',ref,kind+' | '+String(err).slice(0,150));}catch(ignore){console.error(ignore);}
 }
}


/** v1.5 Persistent, account-scoped notification center. Email delivery is independent. */
function partnerNewNotification_(affiliateId,type,title,message,reference){
 const id=partnerClean_(affiliateId,45);
 if(!id)return;
 const ref=partnerClean_(reference||'',120),kind=partnerClean_(type,32);
 // Only deduplicate notifications representing a single immutable business event.
 if(['inquiry','confirmed','payout_paid'].includes(kind)&&ref&&partnerRows_('notifications').some(r=>r['Affiliate ID']===id&&r.Type===kind&&partnerUnquote_(r.Reference)===ref))return;
 partnerSheet_('notifications').appendRow(['NT-'+partnerUuid_().slice(0,16),new Date(),id,kind,partnerSafe_(partnerClean_(title,130)),partnerSafe_(partnerClean_(message,450)),partnerSafe_(ref),'']);
}
function partnerNotifications_(affiliateId){
 return partnerRows_('notifications').filter(r=>r['Affiliate ID']===affiliateId).reverse().slice(0,100).map(r=>({
  id:r['Notification ID'],created:String(r['Created At']||''),type:r.Type,
  title:partnerUnquote_(r.Title),message:partnerUnquote_(r.Message),reference:partnerUnquote_(r.Reference),read:!!r['Read At']
 }));
}
function partnerMarkNotificationRead_(auth,p){
 if(!auth.id)throw Error('An affiliate account is required.');
 const id=partnerClean_(p.notificationId,50);
 const row=partnerRows_('notifications').find(r=>r['Notification ID']===id&&r['Affiliate ID']===auth.id);
 if(!row)throw Error('Notification not found.');
 if(!row['Read At'])partnerSheet_('notifications').getRange(row._row,8).setValue(new Date());
 return {message:'Notification marked as read.'};
}
function partnerSendAnnouncement_(auth,p){
 partnerAdmin_(auth);
 const title=partnerClean_(p.title,120),message=partnerClean_(p.message,400);
 if(title.length<3||message.length<5)throw Error('Enter an announcement title and message.');
 const targets=partnerRows_('affiliates').filter(a=>a.Status==='Approved');
 if(!targets.length)throw Error('No approved affiliates to notify.');
 if(targets.length>400)throw Error('Use a batch process for over 400 affiliates.');
 targets.forEach(a=>partnerNewNotification_(a.ID,'announcement',title,message,''));
 partnerAudit_(auth.email,'announcement','all','Sent to '+targets.length+' approved affiliates');
 return {message:'Announcement delivered to '+targets.length+' affiliate notification centers.'};
}

function partnerTier_(n){return n>=11?{name:'Platinum',rate:.30}:n>=6?{name:'Gold',rate:.20}:n>=3?{name:'Silver',rate:.10}:{name:'Starter',rate:0};}
function partnerMonth_(date){return String(date||'').slice(0,7);}
function partnerDate_(date){let d=String(date||'');if(!/^\d{4}-\d\d-\d\d$/.test(d)||isNaN(Date.parse(d+'T00:00:00Z')))throw Error('Enter a valid event date.');return d;}
function partnerFigures_(bookings,id){
 const completed=bookings.filter(b=>b['Affiliate ID']===id&&b.Status==='Completed');
 const counts={},unique={};completed.forEach(b=>{let k=partnerMonth_(b['Event Date']);(unique[k]||(unique[k]=new Set())).add(partnerInquiryIdForBooking_(partnerUnquote_(b['Booking ID'])));});Object.keys(unique).forEach(k=>counts[k]=unique[k].size);
 const rows=bookings.filter(b=>b['Affiliate ID']===id).map(b=>{const month=partnerMonth_(b['Event Date']),tier=partnerTier_(counts[month]||0),base=b.Status==='Completed'?partnerBaseCommission_(b):0,bonus=Math.round(base*tier.rate*100)/100,current=base+bonus;
 return {id:partnerUnquote_(b['Booking ID']),date:b['Event Date'],month,package:BASE_NAMES[b['Package Key']]||b['Package Key'],status:b.Status,base,bonus,total:b.Status==='Completed'?(b['Paid At']!==''&&b['Paid At']!=null?Number(b['Paid Amount']):current):0,payout:b['Paid At']?'Paid':'Unpaid',tier:tier.name};});
 return {rows,counts};
}
function partnerDashboard_(auth){
 let a=partnerRows_('affiliates').find(x=>x.ID===auth.id),admin=auth.admin;
 if(!a&&admin)return {admin:true,profile:{name:'Administrator'}};
 if(!a)throw Error('Affiliate account not found.');
 const stats=partnerFigures_(partnerRows_('bookings'),a.ID),month=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM'),thisMonth=stats.rows.filter(x=>x.month===month&&x.status==='Completed');
 return {profile:{id:a.ID,name:String(a.Name).replace(/^'/,''),code:a.Code,status:a.Status,tier:partnerTier_(stats.counts[month]||0).name,paymentMethod:a['Payment Method'],paymentName:partnerUnquote_(a['Payment Name']),paymentNumber:partnerUnquote_(a['Payment Number']),hasQr:!!a['QR File ID']},payouts:partnerRows_('payouts').filter(r=>r['Affiliate ID']===a.ID).map(r=>({id:r['Payout ID'],amount:Number(r.Amount)||0,status:r.Status,method:r.Method,reference:r.Reference||'',paidAt:r['Paid At']||'',hasReceipt:!!r['Receipt File ID']})),available:partnerPayoutEligible_(a.ID).amount,completed:stats.counts[month]||0,earned:thisMonth.reduce((s,r)=>s+r.total,0),paid:stats.rows.filter(r=>r.payout==='Paid').reduce((s,r)=>s+r.total,0),rows:stats.rows,inquiries:partnerPublicInquiries_(a.ID),notifications:partnerNotifications_(a.ID)};
}
function partnerAdminData_(){
 const affiliates=partnerRows_('affiliates').map(x=>({id:x.ID,name:String(x.Name).replace(/^'/,''),email:x.Email,type:x.Type,status:x.Status,code:x.Code}));
 const bookings=partnerRows_('bookings');const figures={};affiliates.forEach(a=>figures[a.id]=partnerFigures_(bookings,a.id));
 return {inquiries:partnerAllInquiries_(),affiliates:affiliates.map(a=>{const r=partnerRows_('affiliates').find(x=>x.ID===a.id);return Object.assign(a,{paymentMethod:r['Payment Method']||'',paymentName:partnerUnquote_(r['Payment Name']),paymentNumber:partnerUnquote_(r['Payment Number']),hasQr:!!r['QR File ID']});}),payouts:partnerRows_('payouts').map(r=>({id:r['Payout ID'],affiliateId:r['Affiliate ID'],amount:Number(r.Amount)||0,status:r.Status,method:r.Method,accountName:partnerUnquote_(r['Account Name']),accountNumber:partnerUnquote_(r['Account Number']),reference:r.Reference||'',paidAt:r['Paid At']||'',bookingIds:r['Booking IDs']||'',hasReceipt:!!r['Receipt File ID']})),bookings:bookings.map(b=>{let v=(figures[b['Affiliate ID']]||{rows:[]}).rows.find(x=>x.id===partnerUnquote_(b['Booking ID']));return {id:partnerUnquote_(b['Booking ID']),affiliateCode:b['Affiliate Code'],packageKey:b['Package Key'],package:BASE_NAMES[b['Package Key']]||'',eventDate:b['Event Date'],status:b.Status,payout:v?v.payout:'Unpaid',month:v?v.month:'',total:v?v.total:0,paidAt:b['Paid At']||''};})};
}
function partnerSetAffiliate_(auth,p){let id=partnerClean_(p.id,40),status=partnerClean_(p.status,20);if(!['Approved','Rejected','Suspended','Pending'].includes(status))throw Error('Invalid status.');
 let row=partnerRows_('affiliates').find(x=>x.ID===id);if(!row)throw Error('Affiliate not found.');
 partnerSheet_('affiliates').getRange(row._row,9).setValue(status);partnerAudit_(auth.email,'affiliate_status',id,status);
 if(status==='Approved')MailApp.sendEmail(row.Email,'POSE Partners: account approved','Your POSE Partners affiliate account is approved. Sign in at https://poseph.com/partners/dashboard.html to get your referral code.');
 return {message:'Affiliate updated.'};}
/** Backend-to-backend import. No customer name, contact or email is stored here. */
function partnerSyncInquiry_(p){
 const secret=String(partnerProps_().getProperty('PARTNERS_SYNC_SECRET')||'');
 if(secret.length<32||String(p.syncSecret||'')!==secret)throw Error('Unauthorized inquiry import.');
 const id=partnerClean_(p.submissionId,120),code=partnerClean_(p.affiliateCode,30).toUpperCase(),
       service=partnerClean_(p.service,120),pkg=partnerClean_(p.package,120),
       date=partnerClean_(p.eventDate,40),received=partnerClean_(p.received,40);
 if(!/^[a-zA-Z0-9_-]{8,120}$/.test(id)||!/^POSE[0-9A-F]{8}$/.test(code))throw Error('Invalid inquiry identity.');
 const affiliate=partnerRows_('affiliates').find(a=>a.Code===code&&a.Status==='Approved');
 if(!affiliate)return {message:'Referral code not associated with an approved affiliate.',accepted:false};
 const existing=partnerRows_('inquiries').find(r=>partnerUnquote_(r['Submission ID'])===id);
 if(existing){
   if(existing['Affiliate ID']!==affiliate.ID)throw Error('Referral attribution conflict.');
   return {message:'Inquiry already received.',accepted:true,duplicate:true};
 }
 partnerSheet_('inquiries').appendRow([partnerSafe_(id),received||new Date(),affiliate.ID,code,
   partnerSafe_(service),partnerSafe_(pkg),date,'New Inquiry','',new Date()]);
 partnerAudit_('inquiry-backend','inquiry_imported',id,code);
 partnerNewNotification_(affiliate.ID,'inquiry','New referred inquiry','Service: '+(service||pkg)+' · Event date: '+date,id);
 partnerNotify_(affiliate,'inquiry',id,{service:service||pkg,eventDate:date});
 return {message:'Inquiry recorded.',accepted:true};
}
function partnerPublicInquiries_(affiliateId){
 return partnerRows_('inquiries').filter(r=>r['Affiliate ID']===affiliateId).map(partnerInquiryPublic_);
}
function partnerAllInquiries_(){return partnerRows_('inquiries').map(partnerInquiryPublic_);}
function partnerInquiryPublic_(r){
 return {id:partnerUnquote_(r['Submission ID']),received:String(r.Received||'').slice(0,10),
  affiliateCode:r['Affiliate Code'],service:partnerUnquote_(r.Service),package:partnerUnquote_(r.Package),
  eventDate:String(r['Event Date']||'').slice(0,10),status:r.Status||'New Inquiry',
  bookingId:partnerUnquote_(r['Linked Booking ID'])};
}
function partnerSetInquiry_(auth,p){
 const id=partnerClean_(p.id,120),status=partnerClean_(p.status,30);
 if(!['New Inquiry','In Progress','Cancelled'].includes(status))throw Error('Invalid inquiry status.');
 const row=partnerRows_('inquiries').find(r=>partnerUnquote_(r['Submission ID'])===id);
 if(!row)throw Error('Inquiry not found.');
 if(row['Linked Booking ID'])throw Error('Linked inquiry status follows the booking. Change booking status instead.');
 partnerSheet_('inquiries').getRange(row._row,8).setValue(status);
 partnerAudit_(auth.email,'inquiry_status',id,status);
 partnerNewNotification_(row['Affiliate ID'],'inquiry_update','Inquiry status updated','Inquiry '+id+' is now '+status+'.',id);
 return {message:'Inquiry status updated.'};
}
function partnerUpdateLinkedInquiry_(id,status){
 const inquiryId=partnerInquiryIdForBooking_(id);
 const row=partnerRows_('inquiries').find(r=>partnerUnquote_(r['Submission ID'])===inquiryId);
 if(!row)return;
 const services=partnerRows_('bookings').filter(b=>partnerInquiryIdForBooking_(partnerUnquote_(b['Booking ID']))===inquiryId);
 const next=services.some(b=>b.Status==='Pending')?'Confirmed Booking':services.some(b=>b.Status==='Completed')?'Completed':'Cancelled';
 partnerSheet_('inquiries').getRange(row._row,8).setValue(next);
}
function partnerRecordBooking_(auth,p){
 const inquiryId=partnerClean_(p.bookingId,120),code=partnerClean_(p.affiliateCode,30).toUpperCase(),service=partnerClean_(p.packageKey,40),date=partnerDate_(p.eventDate),status=partnerClean_(p.status||'Pending',20);
 if(!inquiryId||inquiryId.length>95||!Object.prototype.hasOwnProperty.call(BASE_RATES,service)||!['Pending','Completed','Cancelled'].includes(status))throw Error('Invalid service booking details.');
 const affiliate=partnerRows_('affiliates').find(x=>x.Code===code&&x.Status==='Approved');
 if(!affiliate)throw Error('Affiliate code is not approved.');
 const linked=partnerRows_('inquiries').find(r=>partnerUnquote_(r['Submission ID'])===inquiryId);
 if(!linked)throw Error('Inquiry not synced. Run syncRecentPartnerInquiries() in inquiry Apps Script.');
 if(linked['Affiliate ID']!==affiliate.ID)throw Error('Inquiry referral does not match affiliate.');
 if(linked.Status==='Cancelled')throw Error('Cannot book a cancelled inquiry.');
 if(partnerDate_(linked['Event Date'])!==date)throw Error('Event date must match the inquiry.');
 const existing=partnerRows_('bookings').filter(b=>partnerInquiryIdForBooking_(partnerUnquote_(b['Booking ID']))===inquiryId);
 if(existing.some(b=>b['Affiliate ID']!==affiliate.ID||b['Event Date']!==date))throw Error('Existing inquiry booking has conflicting attribution or event date.');
 // One commission per distinct service per inquiry; no bundle or addon options.
 if(existing.some(b=>b['Package Key']===service||((service==='classic')&&['classic4r','classicstrip'].includes(b['Package Key']))))throw Error('This service is already recorded for this inquiry.');
 if(existing.some(b=>['classic4r','classicstrip'].includes(service)&&b['Package Key']==='classic'))throw Error('Classic service already recorded.');
 const bookingId=existing.length?inquiryId+'__SVC_'+service.toUpperCase():inquiryId;
 if(partnerRows_('bookings').some(b=>partnerUnquote_(b['Booking ID'])===bookingId))throw Error('Booking identifier already exists.');
 partnerSheet_('bookings').appendRow([partnerSafe_(bookingId),new Date(),affiliate.ID,code,service,date,status,'','',BASE_RATES[service]]);
 if(!linked['Linked Booking ID'])partnerSheet_('inquiries').getRange(linked._row,9).setValue(partnerSafe_(bookingId));
 partnerUpdateLinkedInquiry_(bookingId,status);
 partnerAudit_(auth.email,'record_service',bookingId,code+' '+service+' '+status+' base='+BASE_RATES[service]);
 partnerNewNotification_(affiliate.ID,status==='Cancelled'?'booking_cancelled':'confirmed',status==='Cancelled'?'Service cancelled':'Referral service recorded',
  'Booking '+bookingId+' · '+BASE_NAMES[service]+' · '+status+'.',bookingId);
 if(status!=='Cancelled')partnerNotify_(affiliate,'confirmed',bookingId,{service:BASE_NAMES[service],eventDate:date});
 return {message:'Service recorded at ₱'+BASE_RATES[service]+' base commission. Inquiry linked.'};
}
function partnerFindBooking_(id){return partnerRows_('bookings').find(x=>String(x['Booking ID']).replace(/^'/,'')===id);}
function partnerSetBooking_(auth,p){let id=partnerClean_(p.id,120),status=partnerClean_(p.status,20);if(!['Pending','Completed','Cancelled'].includes(status))throw Error('Invalid status.');let row=partnerFindBooking_(id);if(!row)throw Error('Booking not found.');
 if(partnerPayoutLocked_(id))throw Error('Booking is attached to a payout request. Resolve payout first.');
 if(row['Paid At']&&status!=='Completed')throw Error('A paid commission cannot change status. Correct it manually through a controlled adjustment.');
 partnerSheet_('bookings').getRange(row._row,7).setValue(status);partnerUpdateLinkedInquiry_(id,status);partnerAudit_(auth.email,'booking_status',id,status);
 partnerNewNotification_(row['Affiliate ID'],'booking_update','Booking status updated','Booking '+id+' is now '+status+'.',id);
 return {message:'Booking updated.'};}
function partnerPayBooking_(auth,p){const id=partnerClean_(p.id,120),row=partnerFindBooking_(id);if(!row||row.Status!=='Completed')throw Error('Only completed bookings qualify.');if(row['Paid At'])throw Error('Already marked paid.');
 const figure=partnerFigures_(partnerRows_('bookings'),row['Affiliate ID']).rows.find(x=>x.id===partnerUnquote_(row['Booking ID']));if(!figure)throw Error('Commission not found.');
 const amount=figure.total;if(!amount||amount<0)throw Error('Invalid amount.');
 partnerSheet_('bookings').getRange(row._row,8,1,2).setValues([[amount,new Date()]]);partnerAudit_(auth.email,'payout',id,'PHP '+amount);return {message:'Commission marked paid: ₱'+amount};}
function partnerJson_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}


/** v1.1 manual QR payout module. QR data remains private in owner Drive. */
function partnerUnquote_(s){return String(s||'').replace(/^'/,'');}
function partnerPaymentFields_(p){
 const method=partnerClean_(p.paymentMethod,20),name=partnerClean_(p.paymentName,120),number=partnerClean_(p.paymentNumber,24);
 if(!['GCash','Maya'].includes(method))throw Error('Choose GCash or Maya.');
 if(!name||!/^(?:\+63|0)9\d{9}$/.test(number.replace(/[\s-]/g,'')))throw Error('Enter wallet holder name and valid Philippine mobile wallet number.');
 return {method,name,number:number.replace(/[\s-]/g,'')};
}
function partnerQrFolder_(){
 const props=partnerProps_();let id=props.getProperty('PARTNERS_QR_FOLDER_ID');
 if(id)return DriveApp.getFolderById(id);
 const folder=DriveApp.createFolder('POSE Partners - PRIVATE Payment QRs');props.setProperty('PARTNERS_QR_FOLDER_ID',folder.getId());return folder;
}
function partnerSaveQr_(data,id){
 const m=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(data||''));
 if(!m)throw Error('Payment QR image required. Choose a PNG or JPEG image.');
 const bytes=Utilities.base64Decode(m[2]);if(bytes.length>500000||bytes.length<100)throw Error('QR image must be smaller than 500 KB after processing.');
 const ext=m[1]==='png'?'png':'jpg',mime=m[1]==='png'?'image/png':'image/jpeg';
 const blob=Utilities.newBlob(bytes,mime,'wallet-qr-'+id+'.'+ext);
 return partnerQrFolder_().createFile(blob).getId();
}
function partnerGetQr_(auth,p){
 const id=partnerClean_(p.affiliateId,40)||auth.id;
 if(!auth.admin&&id!==auth.id)throw Error('Not authorized to view this QR.');
 const a=partnerRows_('affiliates').find(r=>r.ID===id);if(!a||!a['QR File ID'])throw Error('QR not found.');
 const blob=DriveApp.getFileById(String(a['QR File ID'])).getBlob();
 if(blob.getBytes().length>500000)throw Error('QR image is too large.');
 return {data:'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(blob.getBytes())};
}
function partnerUpdatePayment_(auth,p){
 if(auth.admin)throw Error('Sign in with a partner account to update payment details.');
 const a=partnerRows_('affiliates').find(r=>r.ID===auth.id);if(!a)throw Error('Partner not found.');
 if(partnerRows_('payouts').some(r=>r['Affiliate ID']===a.ID&&r.Status==='Requested'))throw Error('Payment details are locked while a payout is pending. Contact POSE.');
 const pay=partnerPaymentFields_(p),qrId=partnerSaveQr_(p.qrData,a.ID);
 partnerSheet_('affiliates').getRange(a._row,11,1,4).setValues([[pay.method,partnerSafe_(pay.name),partnerSafe_(pay.number),qrId]]);
 try{if(a['QR File ID'])DriveApp.getFileById(String(a['QR File ID'])).setTrashed(true);}catch(e){console.warn(e);}
 partnerAudit_(auth.email,'payment_details_updated',a.ID,pay.method);
 return {message:'Payment QR and wallet details updated.'};
}
function partnerPayoutLocked_(bookingId){return partnerRows_('payouts').some(r=>['Requested','Paid'].includes(r.Status)&&String(r['Booking IDs']).split('|').includes(bookingId));}
function partnerPayoutEligible_(id){
 const booked=partnerRows_('bookings'),figures=partnerFigures_(booked,id).rows;
 // Close each event month before payout to preserve retroactive tier logic.
 const current=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM');
 const pendingIds=new Set(partnerRows_('payouts').filter(r=>['Requested','Paid'].includes(r.Status)).flatMap(r=>String(r['Booking IDs']).split('|')));
 const ready=figures.filter(r=>r.status==='Completed'&&r.month<current&&r.payout==='Unpaid'&&!pendingIds.has(r.id));
 return {rows:ready,amount:Math.round(ready.reduce((sum,r)=>sum+r.total,0)*100)/100};
}
function partnerRequestPayout_(auth,p){
 if(auth.admin)throw Error('Only affiliates can request payouts.');
 const a=partnerRows_('affiliates').find(r=>r.ID===auth.id);
 if(!a||a.Status!=='Approved')throw Error('Affiliate is not approved.');
 if(!a['QR File ID']||!a['Payment Method'])throw Error('Update your payment QR first.');
 if(partnerRows_('payouts').some(r=>r['Affiliate ID']===a.ID&&r.Status==='Requested'))throw Error('You already have a payout awaiting processing.');
 const due=partnerPayoutEligible_(a.ID);
 if(due.amount<500)throw Error('Minimum payout is ₱500. Completed event months only.');
 const id='PY-'+partnerUuid_().slice(0,12);
 partnerSheet_('payouts').appendRow([id,new Date(),a.ID,due.amount,'Requested',a['Payment Method'],a['Payment Name'],a['Payment Number'],'','','',due.rows.map(r=>r.id).join('|')]);
 partnerAudit_(auth.email,'request_payout',id,'PHP '+due.amount);
 partnerNewNotification_(a.ID,'payout_requested','Withdrawal requested','Payout '+id+' · PHP '+due.amount+' is awaiting review.',id);
 MailApp.sendEmail(partnerAdminEmail_(),'POSE Partners: payout requested',`Affiliate ${partnerUnquote_(a.Name)} requested PHP ${due.amount}. Payout ID: ${id}. Review details in your admin dashboard.`);
 return {message:'Payout request submitted: '+id+'. POSE will review and transfer to your saved QR.'};
}
function partnerConfirmPayout_(auth,p){
 const id=partnerClean_(p.payoutId,50),reference=partnerClean_(p.reference,100),row=partnerRows_('payouts').find(r=>r['Payout ID']===id);
 if(!row||row.Status!=='Requested')throw Error('Payout not found or already processed.');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{5,99}$/.test(reference))throw Error('Enter the actual payment transaction reference (6+ characters).');
 if(partnerRows_('payouts').some(r=>r.Status==='Paid'&&String(r.Reference).toUpperCase()===reference.toUpperCase()))throw Error('That transaction reference is already recorded.');
 const ids=String(row['Booking IDs']).split('|').filter(Boolean),bookings=partnerRows_('bookings');
 if(!ids.length)throw Error('Payout has no bookings.');
 const eligible=ids.map(bid=>bookings.find(b=>String(b['Booking ID']).replace(/^'/,'')===bid));
 if(eligible.some(b=>!b||b.Status!=='Completed'||b['Paid At']))throw Error('Booking reconciliation failed. Do not mark paid.');
 const figures=partnerFigures_(bookings,row['Affiliate ID']).rows;
 const allocations=ids.map(bid=>figures.find(f=>f.id===bid));
 if(allocations.some(x=>!x)||Math.abs(allocations.reduce((v,x)=>v+x.total,0)-Number(row.Amount))>.01)throw Error('Commission changed since request. Investigate before payment.');
 const receiptId=partnerSavePayoutReceipt_(p.receiptData,id);
 const now=new Date();
 ids.forEach((bid,i)=>partnerSheet_('bookings').getRange(eligible[i]._row,8,1,2).setValues([[allocations[i].total,now]]));
 partnerSheet_('payouts').getRange(row._row,5).setValue('Paid');
 partnerSheet_('payouts').getRange(row._row,9,1,3).setValues([[partnerSafe_(reference),now,auth.email]]);
 partnerSheet_('payouts').getRange(row._row,13).setValue(receiptId);
 partnerAudit_(auth.email,'payout_paid',id,'PHP '+row.Amount+' · Reference: '+reference);
 partnerNewNotification_(row['Affiliate ID'],'payout_paid','Commission payout recorded','Payout '+id+' · PHP '+row.Amount+' paid. Reference: '+reference+'. Receipt available in payout history.',id);
 return {message:'Payout '+id+' recorded as paid. Reference: '+reference};
}

/** v1.2: protected payout proof images. Never expose Drive sharing links. */
function partnerReceiptFolder_(){
 const props=partnerProps_(),id=props.getProperty('PARTNERS_RECEIPT_FOLDER_ID');
 if(id)return DriveApp.getFolderById(id);
 const f=DriveApp.createFolder('POSE Partners - PRIVATE Payout Receipts');
 props.setProperty('PARTNERS_RECEIPT_FOLDER_ID',f.getId());return f;
}
function partnerSavePayoutReceipt_(data,id){
 const m=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(data||''));
 if(!m)throw Error('Upload a GCash or Maya transaction screenshot (PNG or JPG).');
 const bytes=Utilities.base64Decode(m[2]);
 if(bytes.length<100||bytes.length>500000)throw Error('Receipt screenshot must be below 500 KB after processing.');
 const mime='image/'+m[1],ext=m[1]==='png'?'png':'jpg';
 return partnerReceiptFolder_().createFile(Utilities.newBlob(bytes,mime,'receipt-'+id+'.'+ext)).getId();
}
function partnerGetPayoutReceipt_(auth,p){
 const id=partnerClean_(p.payoutId,50),row=partnerRows_('payouts').find(r=>r['Payout ID']===id);
 if(!row||!row['Receipt File ID'])throw Error('No payout receipt is available.');
 if(!auth.admin&&auth.id!==row['Affiliate ID'])throw Error('Not authorized to view this receipt.');
 const blob=DriveApp.getFileById(String(row['Receipt File ID'])).getBlob();
 if(blob.getBytes().length>500000)throw Error('Receipt image too large.');
 return {data:'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(blob.getBytes())};
}
