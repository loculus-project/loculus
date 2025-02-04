package org.loculus.backend.controller.submission

import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DATA_USE_TERMS_DISABLED_CONFIG
import org.loculus.backend.controller.EndpointTest

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$DATA_USE_TERMS_DISABLED_CONFIG"],
)
class SubmitEndpointDataUseTermsDisabledTest {
    // TODO
}
