package org.loculus.backend.controller

import org.loculus.backend.config.configuredViews
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.config.service.OrganismNotFoundException
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/** Resolve the LAPIS base URL backing a view key or an organism key. */
fun ConfigService.lapisUrlFor(organism: String): String {
    getInstanceConfig().config.configuredViews()[organism]?.let { view ->
        return view.lapisUrl
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No LAPIS URL configured for view: $organism")
    }
    val config = try {
        getOrganismConfig(organism).config
    } catch (e: OrganismNotFoundException) {
        throw ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown organism: $organism", e)
    }
    return config.lapisUrl
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No LAPIS URL configured for organism: $organism")
}
