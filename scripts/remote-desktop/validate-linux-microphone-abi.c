/* Public Pulse headers only. No libpulse link, server or device operations. */
#include <stddef.h>
#include <pulse/introspect.h>
_Static_assert(sizeof(void*)==8,"64bit native microphone required");
_Static_assert(sizeof(pa_sample_spec)==12,"sample spec ABI");
_Static_assert(offsetof(pa_sample_spec,rate)==4,"sample rate ABI");
_Static_assert(offsetof(pa_sample_spec,channels)==8,"channel count ABI");
_Static_assert(offsetof(pa_sink_info,proplist)==344,"sink info prefix ABI");
_Static_assert(sizeof(pa_buffer_attr)==20,"buffer attributes ABI");
_Static_assert(PA_SAMPLE_S16LE==3,"S16LE ABI");
_Static_assert(PA_CONTEXT_NOAUTOSPAWN==1,"no daemon ABI");
_Static_assert((PA_STREAM_DONT_MOVE|PA_STREAM_ADJUST_LATENCY)==0x2200,"fixed output ABI");
int main(void){return 0;}
