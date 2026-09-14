const menu=document.querySelector('.menu');
const nav=document.querySelector('#primary-nav');
menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open);});
document.querySelectorAll('#primary-nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
const yearEl=document.querySelector('#year');if(yearEl)yearEl.textContent=new Date().getFullYear();

// Keep same-page navigation reliable during local preview and on the live site.
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const id=a.getAttribute('href').slice(1);const target=document.getElementById(id);if(!target)return;e.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});try{history.replaceState(null,'','#'+id);}catch(_){}}));

const form=document.querySelector('#leadForm');
const formHelp=document.querySelector('#formHelp');
const submitBtn=form?.querySelector('button[type="submit"]');

function setFormMessage(message,type='info'){
  if(!formHelp)return;
  formHelp.textContent=message;
  formHelp.classList.remove('success','error');
  if(type==='success')formHelp.classList.add('success');
  if(type==='error')formHelp.classList.add('error');
}

function submissionId(){
  if(window.crypto?.randomUUID)return crypto.randomUUID();
  return 'pose-'+Date.now()+'-'+Math.random().toString(16).slice(2);
}

form?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.reportValidity())return;

  const endpoint=window.POSE_INQUIRY?.endpoint?.trim();
  if(!endpoint){
    setFormMessage('Online inquiry is not configured yet. Please message POSE on Facebook instead.','error');
    return;
  }

  const data=new FormData(form);
  if(data.get('website'))return; // honeypot

  const payload=new URLSearchParams();
  for(const [key,value] of data.entries())payload.append(key,String(value));
  payload.set('submissionId',submissionId());
  payload.set('source',location.href.split('#')[0]);
  payload.set('submittedAt',new Date().toISOString());

  const original=submitBtn.textContent;
  submitBtn.disabled=true;
  submitBtn.textContent='Sending…';
  setFormMessage('Sending your inquiry…');

  try{
    let response;
    try{
      response=await fetch(endpoint,{method:'POST',body:payload,redirect:'follow'});
      if(response.type!=='opaque' && !response.ok)throw new Error('HTTP '+response.status);
      if(response.type!=='opaque'){
        const result=await response.json().catch(()=>null);
        if(result && result.ok===false)throw new Error(result.error||'Submission failed');
      }
    }catch(firstError){
      // Apps Script may not expose CORS response headers in every hosting setup.
      // A no-cors retry still delivers the form to the Web App.
      await fetch(endpoint,{method:'POST',body:payload,mode:'no-cors'});
    }

    form.reset();
    setFormMessage('Inquiry sent. Thank you! POSE has received your event details. If you provided an email address, a confirmation has also been sent there.','success');
  }catch(err){
    console.error('Inquiry submission failed:',err);
    setFormMessage('We could not send your inquiry right now. Please try again, or message POSE Photobooth on Facebook.','error');
  }finally{
    submitBtn.disabled=false;
    submitBtn.textContent=original;
  }
});
